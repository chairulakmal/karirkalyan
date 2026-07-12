require "csv"

module Exports
  # The convenience view: one row per application, the columns a spreadsheet can hold.
  # It recovers a table, not an account — the data-safety artefact is AccountArchive.
  #
  # A service rather than a query: a query answers a question about the data, and this
  # produces an artefact from it.
  class ApplicationsCsv
    COLUMNS = %w[
      id company role status url applied_at follow_up_at
      created_at updated_at has_resume has_cover_letter notes
    ].freeze

    # Excel, LibreOffice, and Sheets all treat a cell opening with one of these as a
    # formula, so a company literally named `=cmd|'/c calc'!A1` executes on open. This
    # is a file we hand a user and expect them to open in a spreadsheet, which is the
    # whole of the CSV-injection threat model. Prefixing with a single quote is the
    # OWASP-recommended escape: https://owasp.org/www-community/attacks/CSV_Injection
    FORMULA_PREFIXES = %w[= + - @].freeze

    def initialize(user)
      @user = user
    end

    def call
      CSV.generate(force_quotes: true) do |csv|
        csv << COLUMNS
        applications.each { |application| csv << COLUMNS.map { |column| cell(application, column) } }
      end
    end

    def filename
      "karirkalyan-applications-#{Time.zone.today.iso8601}.csv"
    end

    private

    attr_reader :user

    def applications
      user.applications.order(created_at: :asc)
    end

    def cell(application, column)
      value =
        case column
        when "has_resume"       then application.resume.present?
        when "has_cover_letter" then application.cover_letter.present?
        when "applied_at", "follow_up_at", "created_at", "updated_at"
          application.public_send(column)&.iso8601
        else application.public_send(column)
        end

      escape(value)
    end

    def escape(value)
      return value unless value.is_a?(String)
      return value unless value.start_with?(*FORMULA_PREFIXES)

      "'#{value}"
    end
  end
end
