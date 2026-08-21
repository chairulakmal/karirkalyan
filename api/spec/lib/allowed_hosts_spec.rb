require "spec_helper"
require "action_dispatch"
require_relative "../../app/lib/allowed_hosts"

# Exercised through the real ActionDispatch::HostAuthorization::Permissions so
# these assertions track Rails' actual matching (which anchors each pattern and
# appends an optional :port), not our reading of it.
RSpec.describe AllowedHosts do
  subject(:permissions) do
    ActionDispatch::HostAuthorization::Permissions.new(described_class.all(app_host: nil))
  end

  describe "hosts that must be allowed" do
    # Regression: v1.0.1 anchored these patterns with a trailing \z, which made
    # Rails' appended (:\d+)? unmatchable. Every internal web -> api call carries
    # a port, so the whole API 403'd and the frontend reported it as a 401.
    it "allows the internal service host with an explicit port" do
      expect(permissions.allows?("api:8080")).to be true
    end

    it "allows the internal service host without a port" do
      expect(permissions.allows?("api")).to be true
    end

    it "allows the Cloudflare Tunnel's public API subdomain" do
      expect(permissions.allows?("kk-api.chairulakmal.com")).to be true
    end

    it "allows the primary domain, with and without a port" do
      expect(permissions.allows?("kk.chairulakmal.com")).to be true
      expect(permissions.allows?("kk.chairulakmal.com:443")).to be true
    end
  end

  describe "hosts that must be blocked" do
    # The v1.0.1 security finding claimed an unanchored /.*\.railway\.app/
    # accepted these. It never did — Rails anchors the pattern itself.
    it "blocks a trusted host used as a prefix of an attacker domain" do
      expect(permissions.allows?("kk-api.chairulakmal.com.attacker.com")).to be false
      expect(permissions.allows?("api.attacker.com")).to be false
      expect(permissions.allows?("kk.chairulakmal.com.evil.com")).to be false
    end

    it "blocks an unrelated host" do
      expect(permissions.allows?("attacker.com")).to be false
    end

    # Regression: the two-level form was in AllowedHosts and nine other places
    # up through PR #111, but it fails Cloudflare's TLS handshake and was never
    # the real production host (SPEC.md § Deployment). Guards against it
    # silently coming back the same way it silently went in.
    it "blocks the abandoned two-level API hostname" do
      expect(permissions.allows?("api.kk.chairulakmal.com")).to be false
    end
  end

  describe ".all" do
    it "appends APP_HOST when present" do
      expect(described_class.all(app_host: "staging.example.com")).to include("staging.example.com")
    end

    it "omits APP_HOST when blank" do
      expect(described_class.all(app_host: "")).to eq([ described_class::PRIMARY_DOMAIN, *described_class::PATTERNS ])
    end
  end
end
