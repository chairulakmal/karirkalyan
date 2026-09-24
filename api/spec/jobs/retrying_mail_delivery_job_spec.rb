require "rails_helper"

RSpec.describe RetryingMailDeliveryJob do
  let(:user)        { create(:user) }
  let(:application) { create(:application, :applied, user: user, follow_up_at: Time.current) }

  def deliver
    described_class.perform_now("FollowUpMailer", "digest", "deliver_now", args: [ user, [ application.id ] ])
  end

  it "is the delivery job for every mailer" do
    expect(ApplicationMailer.delivery_job).to eq(described_class)
    expect(FollowUpMailer.delivery_job).to eq(described_class)
  end

  # FollowUpReminderJob spends its exactly-once claim before this runs, so a
  # dropped transient failure would be a reminder lost for good.
  it "schedules a retry on a transient SMTP failure" do
    busy = Net::SMTPServerBusy.new(Net::SMTP::Response.parse("421 try again later"))
    allow_any_instance_of(Mail::Message).to receive(:deliver).and_raise(busy)

    expect { deliver }.to have_enqueued_job(described_class)
  end

  it "does not retry a permanent SMTP failure" do
    fatal = Net::SMTPFatalError.new(Net::SMTP::Response.parse("550 mailbox unavailable"))
    allow_any_instance_of(Mail::Message).to receive(:deliver).and_raise(fatal)

    expect { deliver }.to raise_error(Net::SMTPFatalError)
    expect(described_class).not_to have_been_enqueued
  end
end
