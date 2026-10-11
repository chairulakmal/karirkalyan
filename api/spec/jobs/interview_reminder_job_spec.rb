require "rails_helper"

# The push seam is WebPush.payload_send, mocked here; everything else runs
# against the real database. PushVapid is stubbed on so the job proceeds.
RSpec.describe InterviewReminderJob do
  let(:user) { create(:user) }
  let(:vapid) { { subject: "mailto:x@example.com", public_key: "pub", private_key: "priv" } }

  before do
    allow(PushVapid).to receive_messages(configured?: true, vapid_options: vapid)
    allow(WebPush).to receive(:payload_send)
    create(:push_subscription, user: user)
  end

  def sent_payloads
    payloads = []
    expect(WebPush).to have_received(:payload_send).at_least(:once) do |args|
      payloads << JSON.parse(args[:message])
    end
    payloads
  end

  it "pushes a reminder for an interview starting within the next day" do
    create(:application, user: user, company: "Mercari", role: "SRE",
           interview_at: 6.hours.from_now)

    described_class.new.perform

    payload = sent_payloads.find { |p| p["title"].include?("Upcoming interview") }
    expect(payload["title"]).to include("Mercari")
    expect(payload["tag"]).to match(/\Ainterview-\d+\z/)
  end

  it "does not remind about an interview further out than the window" do
    create(:application, user: user, interview_at: 3.days.from_now)

    described_class.new.perform

    expect(WebPush).not_to have_received(:payload_send)
  end

  it "does not remind about a closed application that still carries an interview_at" do
    # Scheduled, then the process ended; the stale interview_at should not push.
    create(:application, user: user, status: "rejected", interview_at: 6.hours.from_now)

    described_class.new.perform

    expect(WebPush).not_to have_received(:payload_send)
  end

  it "pushes a residence warning exactly on a threshold day, with the CoE lead time" do
    user.update!(residence_status: "engineer_specialist", residence_expires_on: 30.days.from_now.to_date)

    described_class.new.perform

    payload = sent_payloads.find { |p| p["title"].include?("status of residence") }
    expect(payload["body"]).to include(Visa::COE_LEAD_TIME_DAYS.to_s)
    expect(payload["tag"]).to eq("residence-expiry")
  end

  it "does not push a residence warning off a threshold day" do
    user.update!(residence_status: "engineer_specialist", residence_expires_on: 45.days.from_now.to_date)

    described_class.new.perform

    expect(WebPush).not_to have_received(:payload_send)
  end

  # EOFError was missing from the transient list, so it escaped the loop and
  # every user after the flaky endpoint got nothing, with no retry.
  it "keeps delivering to later users after a network error, then raises it for a retry",
     skip_n_plus_one: true do
    other = create(:user)
    create(:push_subscription, user: other)
    [ user, other ].each { |u| create(:application, user: u, interview_at: 6.hours.from_now) }
    flaky = user.push_subscriptions.first.endpoint
    allow(WebPush).to receive(:payload_send).with(hash_including(endpoint: flaky)).and_raise(EOFError)

    expect { described_class.new.perform }.to raise_error(EOFError)

    expect(WebPush).to have_received(:payload_send)
      .with(hash_including(endpoint: other.push_subscriptions.first.endpoint))
  end

  it "skips the shared demo account" do
    demo = create(:user, email: Demo::ResetService::DEMO_EMAIL)
    create(:push_subscription, user: demo)
    create(:application, user: demo, interview_at: 6.hours.from_now)

    described_class.new.perform

    expect(WebPush).not_to have_received(:payload_send)
      .with(hash_including(endpoint: demo.push_subscriptions.first.endpoint))
  end

  it "does nothing without VAPID keys" do
    allow(PushVapid).to receive(:configured?).and_return(false)
    create(:application, user: user, interview_at: 3.hours.from_now)

    described_class.new.perform

    expect(WebPush).not_to have_received(:payload_send)
  end
end
