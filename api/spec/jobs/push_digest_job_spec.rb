require "rails_helper"

# The push seam is WebPush.payload_send — the one call that leaves the process
# (SPEC.md § Testing strategy). Everything up to it runs for real against the
# database. PushVapid is stubbed both ways deliberately: dev has keys in .env
# and CI has none, and a spec must not change meaning between the two.
RSpec.describe PushDigestJob do
  let(:user)         { create(:user) }
  let(:application)  { create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0)) }
  let!(:subscription) { create(:push_subscription, user: user) }

  let(:vapid) { { subject: "mailto:test@example.com", public_key: "pub", private_key: "priv" } }

  before do
    allow(PushVapid).to receive_messages(configured?: true, vapid_options: vapid)
    allow(WebPush).to receive(:payload_send)
  end

  def perform(ids = [ application.id ])
    described_class.new.perform(user, ids)
  end

  it "sends one payload per subscription, signed with the VAPID options and a 24h TTL" do
    second = create(:push_subscription, user: user)

    perform

    [ subscription, second ].each do |sub|
      expect(WebPush).to have_received(:payload_send).with(
        hash_including(endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth,
                       ttl: 24.hours.to_i, vapid: vapid)
      )
    end
  end

  it "mirrors the mailer's subject rule for a single reminder, deep-linking the application" do
    perform

    expect(WebPush).to have_received(:payload_send) do |args|
      payload = JSON.parse(args[:message])
      expect(payload["title"]).to eq("Follow up on your #{application.company} application")
      expect(payload["url"]).to eq("/applications/#{application.id}")
    end
  end

  it "counts several reminders and deep-links the dashboard" do
    second = create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))

    perform([ application.id, second.id ])

    expect(WebPush).to have_received(:payload_send) do |args|
      payload = JSON.parse(args[:message])
      expect(payload["title"]).to eq("2 follow-ups due today")
      expect(payload["url"]).to eq("/dashboard")
    end
  end

  it "prunes a subscription the push service reports revoked, and still serves the others" do
    survivor = create(:push_subscription, user: user)
    gone = double(code: "410", message: "Gone", body: "")
    allow(WebPush).to receive(:payload_send)
      .with(hash_including(endpoint: subscription.endpoint))
      .and_raise(WebPush::ExpiredSubscription.new(gone, "push.example"))

    expect { perform }.to change(PushSubscription, :count).by(-1)

    expect(PushSubscription.exists?(subscription.id)).to be(false)
    expect(WebPush).to have_received(:payload_send)
      .with(hash_including(endpoint: survivor.endpoint))
  end

  it "logs and keeps the row on any other push-service error, still serving the others" do
    survivor = create(:push_subscription, user: user)
    too_many = double(code: "429", message: "Too Many Requests", body: "")
    allow(WebPush).to receive(:payload_send)
      .with(hash_including(endpoint: subscription.endpoint))
      .and_raise(WebPush::ResponseError.new(too_many, "push.example"))

    expect { perform }.not_to change(PushSubscription, :count)

    expect(WebPush).to have_received(:payload_send)
      .with(hash_including(endpoint: survivor.endpoint))
  end

  it "does nothing without VAPID keys — the digest stays email-only" do
    allow(PushVapid).to receive(:configured?).and_return(false)

    perform

    expect(WebPush).not_to have_received(:payload_send)
  end

  it "does nothing when the claimed applications no longer exist" do
    perform([ application.id ])
    application.destroy!

    expect(WebPush).to have_received(:payload_send).once
  end
end
