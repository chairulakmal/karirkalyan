require "spec_helper"
require "active_support/core_ext/object/blank"
require_relative "../../app/lib/job_board"

RSpec.describe JobBoard do
  describe ".from_url" do
    it "returns the host without a leading www." do
      expect(described_class.from_url("https://www.linkedin.com/jobs/42")).to eq("linkedin.com")
    end

    it "keeps subdomains other than www" do
      expect(described_class.from_url("https://jobs.lever.co/acme/123")).to eq("jobs.lever.co")
    end

    it "downcases the host" do
      expect(described_class.from_url("https://TokyoDev.com/jobs/9")).to eq("tokyodev.com")
    end

    it "ignores path and query" do
      expect(described_class.from_url("https://wantedly.com/projects/1?utm=x")).to eq("wantedly.com")
    end

    it "returns nil for a blank url" do
      expect(described_class.from_url(nil)).to be_nil
      expect(described_class.from_url("")).to be_nil
    end

    it "returns nil for a urls without a host" do
      expect(described_class.from_url("not a url")).to be_nil
    end
  end
end
