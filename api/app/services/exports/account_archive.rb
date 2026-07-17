require "zip"

module Exports
  # The data-safety artefact, and the reason exports exist at all: the real job-search
  # history lives in one Railway Postgres, and the Hobby plan has no managed backups.
  # Scheduled pg_dumps cover that from the outside; this covers it from the inside, and
  # is the leg the user can pull without a provider, a cron runner, or a shell.
  #
  # Contents:
  #   account.json           user, every application with every column, every timeline entry
  #   resumes/              {company}-{role}-{MMDD}-{id}-resume.pdf
  #   cover-letters/        {company}-{role}-{MMDD}-{id}-cover-letter.pdf
  #
  # Built in memory, which is a deliberate cap rather than an oversight: blobs are capped
  # at 1 MB each and this is a single-user app, so the peak is bounded by
  # applications × 2 MB. If that ever stops being true the fix is streaming — the
  # per-account throttle on the endpoint is what buys the time to notice.
  class AccountArchive
    # Bumped when the shape of account.json changes, so a future importer can tell what
    # it is reading rather than guessing from the keys present.
    SCHEMA_VERSION = 1

    DIRECTORIES = { resume: "resumes", cover_letter: "cover-letters" }.freeze

    def initialize(user)
      @user = user
    end

    def call
      buffer = Zip::OutputStream.write_buffer do |zip|
        zip.put_next_entry("account.json")
        zip.write(JSON.pretty_generate(manifest))

        applications.each do |application|
          Application::DOWNLOAD_KINDS.each { |kind| write_blob(zip, application, kind) }
        end
      end

      buffer.string
    end

    def filename
      "karirkalyan-account-#{Time.zone.today.iso8601}.zip"
    end

    private

    attr_reader :user

    def applications
      @applications ||= user.applications
        .includes(:timeline_entries)
        .order(created_at: :asc)
        .to_a
    end

    def manifest
      {
        schema_version: SCHEMA_VERSION,
        exported_at:    Time.current.iso8601,
        user:           { id: user.id, email: user.email, created_at: user.created_at.iso8601 },
        applications:   applications.map { |application| application_json(application) }
      }
    end

    # as_json already drops the two blob columns (Application#as_json), which is what we
    # want here: the PDFs travel as files, and each row names its own so the mapping
    # survives even when the slug is unhelpful.
    def application_json(application)
      application.as_json.merge(
        resume_file:       blob_path_if_present(application, :resume),
        cover_letter_file: blob_path_if_present(application, :cover_letter),
        timeline_entries:  application.timeline_entries.sort_by(&:created_at).as_json
      )
    end

    def blob_path_if_present(application, kind)
      application.public_send(kind).present? ? blob_path(application, kind) : nil
    end

    def write_blob(zip, application, kind)
      blob = application.public_send(kind)
      return if blob.blank?

      zip.put_next_entry(blob_path(application, kind))
      zip.write(blob)
    end

    # Application#download_basename is the one place a PDF gets named, so an archived file and
    # the same file downloaded singly agree — see SPEC.md § Download filenames. The directory
    # is the only thing the archive adds.
    def blob_path(application, kind)
      "#{DIRECTORIES.fetch(kind)}/#{application.download_basename(kind: kind)}"
    end
  end
end
