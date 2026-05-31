require "rails_helper"

RSpec.describe FollowUpMailer, type: :mailer do
  describe "#reminder" do
    let(:user)        { create(:user, email: "candidate@example.com") }
    let(:application) do
      create(:application, :applied, user: user, company: "Mercari", role: "Backend Engineer", follow_up_at: Time.current)
    end
    let(:mail) { described_class.reminder(application) }

    it "addresses the email to the application's owner" do
      expect(mail.to).to eq([ "candidate@example.com" ])
    end

    it "sets a subject naming the company" do
      expect(mail.subject).to eq("Follow up on your Mercari application")
    end

    it "uses the configured from address" do
      expect(mail.from).to be_present
    end

    it "names the role and company in the body" do
      expect(mail.body.encoded).to include("Mercari")
      expect(mail.body.encoded).to include("Backend Engineer")
    end

    it "links to the application detail page" do
      expect(mail.body.encoded).to include("/applications/#{application.id}")
    end

    it "renders both an HTML and a plain-text part" do
      expect(mail.body.parts.map(&:content_type)).to include(
        a_string_matching("text/html"),
        a_string_matching("text/plain")
      )
    end
  end
end
