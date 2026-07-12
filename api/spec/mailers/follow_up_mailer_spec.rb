require "rails_helper"

RSpec.describe FollowUpMailer, type: :mailer do
  describe "#digest" do
    let(:user) { create(:user, email: "candidate@example.com") }
    let(:mercari) do
      create(:application, :applied, user: user, company: "Mercari",
        role: "Backend Engineer", follow_up_at: Time.current)
    end
    let(:smartnews) do
      create(:application, :applied, user: user, company: "SmartNews",
        role: "Full-Stack Engineer", follow_up_at: Time.current)
    end

    context "with one application" do
      let(:mail) { described_class.digest(user, [ mercari ]) }

      it "addresses the email to the user" do
        expect(mail.to).to eq([ "candidate@example.com" ])
      end

      # The single case is the common case, so its subject reads like a sentence rather
      # than a report with a count of one in it.
      it "names the company in the subject" do
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
        expect(mail.body.encoded).to include("/applications/#{mercari.id}")
      end

      it "renders both an HTML and a plain-text part" do
        expect(mail.body.parts.map(&:content_type)).to include(
          a_string_matching("text/html"),
          a_string_matching("text/plain")
        )
      end
    end

    context "with several applications" do
      let(:mail) { described_class.digest(user, [ mercari, smartnews ]) }

      it "counts them in the subject instead of naming one" do
        expect(mail.subject).to eq("2 follow-ups due today")
      end

      it "lists every application, each with its own link" do
        body = mail.body.encoded
        expect(body).to include("Mercari", "SmartNews")
        expect(body).to include("/applications/#{mercari.id}", "/applications/#{smartnews.id}")
      end
    end
  end
end
