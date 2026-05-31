require "rails_helper"

RSpec.describe WelcomeMailer, type: :mailer do
  describe "#welcome" do
    let(:user) { create(:user, email: "newcomer@example.com") }
    let(:mail) { described_class.welcome(user) }

    it "addresses the email to the new user" do
      expect(mail.to).to eq([ "newcomer@example.com" ])
    end

    it "sets a welcome subject" do
      expect(mail.subject).to eq("Welcome to KarirKalyan")
    end

    it "links to the new-application and dashboard pages" do
      expect(mail.body.encoded).to include("/applications/new")
      expect(mail.body.encoded).to include("/dashboard")
    end

    it "renders both an HTML and a plain-text part" do
      expect(mail.body.parts.map(&:content_type)).to include(
        a_string_matching("text/html"),
        a_string_matching("text/plain")
      )
    end
  end
end
