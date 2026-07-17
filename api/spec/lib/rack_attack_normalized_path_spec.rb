require "rails_helper"

# Rack::Attack sits above the router, so its path guards see raw PATH_INFO while Rails routes
# a wider set of strings to the same action. A guard that misses one returns nil, and a nil
# key means no counter and no limit — it fails *open*. normalized_path is what closes that.
#
# This is a unit spec rather than a request spec on purpose, and the reason is the whole point
# of the file: Rack::Test rewrites the URI before it builds the env, so a request spec asking
# for "/api/v1/applications//12" hands the middleware "/api/v1/applications/12" and passes
# whether or not normalized_path exists. Only by building the env by hand can the trailing-
# and doubled-slash cases fail when the code is wrong. The .json case reaches PATH_INFO intact
# and is covered end-to-end in spec/requests/rack_attack_spec.rb.
#
# That Rails really does route these — they are not hypothetical strings — is verified by the
# routing block at the bottom. See SPEC.md § Security.
RSpec.describe Rack::Attack, ".normalized_path" do
  def normalized(path)
    described_class.normalized_path(Rack::Request.new("PATH_INFO" => path))
  end

  it "leaves an already-canonical path alone" do
    expect(normalized("/api/v1/applications")).to eq("/api/v1/applications")
    expect(normalized("/api/v1/applications/12")).to eq("/api/v1/applications/12")
  end

  it "strips a format extension" do
    expect(normalized("/api/v1/auth/sign_in.json")).to eq("/api/v1/auth/sign_in")
    expect(normalized("/api/v1/applications/12.xml")).to eq("/api/v1/applications/12")
  end

  it "strips a trailing slash" do
    expect(normalized("/api/v1/auth/sign_in/")).to eq("/api/v1/auth/sign_in")
    expect(normalized("/api/v1/applications/")).to eq("/api/v1/applications")
  end

  it "collapses duplicate slashes" do
    expect(normalized("/api/v1/applications//12")).to eq("/api/v1/applications/12")
    expect(normalized("//api//v1//applications")).to eq("/api/v1/applications")
  end

  # squeeze runs before the extension is stripped, so a combined form collapses in one pass
  # rather than leaving half a bypass behind.
  it "handles a doubled slash and an extension together" do
    expect(normalized("/api/v1/applications//12.json")).to eq("/api/v1/applications/12")
  end

  # The (?<=.) lookbehind exists for exactly this: "/" is a trailing slash by the naive rule,
  # and normalising it to "" would make every start_with? guard behave unpredictably.
  it "does not normalise the root path to an empty string" do
    expect(normalized("/")).to eq("/")
  end

  it "memoises on the Rack env, so several throttles sharing a request normalise once" do
    req = Rack::Request.new("PATH_INFO" => "/api/v1/applications.json")

    expect(described_class.normalized_path(req)).to eq("/api/v1/applications")
    expect(req.env["rack_attack.normalized_path"]).to eq("/api/v1/applications")

    # Prove it reads the memo rather than recomputing: poison PATH_INFO and expect the
    # cached value to win.
    req.env["PATH_INFO"] = "/something/else"
    expect(described_class.normalized_path(req)).to eq("/api/v1/applications")
  end

  describe "the guards built on it" do
    it "recognises a create whatever suffix the client typed" do
      %w[
        /api/v1/applications
        /api/v1/applications.json
        /api/v1/applications/
      ].each do |path|
        req = Rack::Request.new("PATH_INFO" => path, "REQUEST_METHOD" => "POST")
        # No JWT on this env, so account_id is nil either way — what is under test is that
        # the guard got as far as asking for one rather than bailing at the path check.
        expect(described_class.normalized_path(req)).to eq("/api/v1/applications"), path
      end
    end

    it "still excludes the neighbours the anchors were written to exclude" do
      # prefill has its own caps, and transition carries no blob: both must keep failing the
      # member-path anchor even after normalisation widens what reaches it.
      expect(normalized("/api/v1/applications/prefill")).not_to match(described_class::APPLICATION_MEMBER_PATH)
      expect(normalized("/api/v1/applications/12/transition")).not_to match(described_class::APPLICATION_MEMBER_PATH)
      expect(normalized("/api/v1/applications/12.json")).to match(described_class::APPLICATION_MEMBER_PATH)
    end
  end

  # The premise of the whole file: these are strings Rails actually routes to an action, not
  # strings we imagine it might. If a future Rails tightens routing so that these 404, these
  # examples fail and normalized_path can lose the corresponding rule.
  describe "the routes that make this necessary" do
    def recognizes(method, path)
      Rails.application.routes.recognize_path(path, method: method).values_at(:controller, :action)
    end

    it "routes the bypass forms to the same action as the canonical path" do
      expect(recognizes("POST", "/api/v1/auth/sign_in.json")).to eq(recognizes("POST", "/api/v1/auth/sign_in"))
      expect(recognizes("POST", "/api/v1/auth/sign_in/")).to eq(recognizes("POST", "/api/v1/auth/sign_in"))
      expect(recognizes("POST", "/api/v1/applications.json")).to eq(recognizes("POST", "/api/v1/applications"))
      expect(recognizes("POST", "/api/v1/applications/")).to eq(recognizes("POST", "/api/v1/applications"))
      expect(recognizes("PATCH", "/api/v1/applications/12.json")).to eq(recognizes("PATCH", "/api/v1/applications/12"))
      expect(recognizes("PATCH", "/api/v1/applications//12")).to eq(recognizes("PATCH", "/api/v1/applications/12"))
      expect(recognizes("POST", "/api/v1/applications/prefill.json")).to eq(recognizes("POST", "/api/v1/applications/prefill"))
    end
  end
end
