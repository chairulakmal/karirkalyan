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
        file = export.call

        response.headers["Content-Type"] = "application/zip"
        response.headers["Content-Length"] = file.size.to_s
        response.headers["Content-Disposition"] =
          ActionDispatch::Http::ContentDisposition.format(disposition: "attachment", filename: export.filename)
        # Streamed from disk in chunks, so the archive never sits in memory whole.
        self.response_body = Enumerator.new do |chunks|
          while (chunk = file.read(64.kilobytes))
            chunks << chunk
          end
        ensure
          file.close!
        end
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
