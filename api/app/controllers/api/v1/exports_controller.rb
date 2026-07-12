module Api
  module V1
    # Two endpoints that look like one feature and are not: the CSV is a convenience
    # view (read the data somewhere else), the archive is the data-safety artefact (get
    # the data back). See SPEC.md § API contract → Exports.
    class ExportsController < ApplicationController
      before_action :set_nosniff_header

      def applications
        export = Exports::ApplicationsCsv.new(current_user)
        send_data export.call, filename: export.filename, type: "text/csv", disposition: "attachment"
      end

      def account
        export = Exports::AccountArchive.new(current_user)
        send_data export.call, filename: export.filename, type: "application/zip", disposition: "attachment"
      end

      private

      # A CSV that a browser decides to sniff as HTML is a stored-XSS delivery mechanism,
      # and its cells hold user-supplied company names.
      def set_nosniff_header
        response.headers["X-Content-Type-Options"] = "nosniff"
      end
    end
  end
end
