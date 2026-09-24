require "zip"

module Exports
  # The data-safety artefact, and the reason exports exist at all: the real job-search
  # history lives in one self-hosted Postgres, with no managed backup service behind it.
  # Scheduled pg_dumps (SPEC.md § Backups) cover that from the outside; this covers it
  # from the inside, and is the leg the user can pull without a provider, a cron runner,
  # or a shell.
  #
  # Contents:
  #   account.json           user, every application with every column, every timeline entry
  #   resumes/              {company}-{role}-{MMDD}-{id}-resume.pdf
  #   cover-letters/        {company}-{role}-{MMDD}-{id}-cover-letter.pdf
  #
  # Written to a Tempfile, reading the PDFs BLOB_BATCH applications at a time, so the
  # peak memory is one batch (about 20 MB) rather than the whole account. Built in
  # memory it was every blob plus the zip, around 800 MB at the 200-application cap,
  # inside a 1 GB container and reachable from the public demo account.
  class AccountArchive
    # Bumped when the shape of account.json changes, so a future importer can tell what
    # it is reading rather than guessing from the keys present.
    SCHEMA_VERSION = 1

    DIRECTORIES = { resume: "resumes", cover_letter: "cover-letters" }.freeze

    BLOB_BATCH = 10

    def initialize(user)
      @user = user
    end

    # Returns the finished archive as a rewound Tempfile; the caller streams it
    # and then calls close! on it.
    def call
      file = Tempfile.new([ "karirkalyan-account", ".zip" ], binmode: true)
      Zip::OutputStream.write_buffer(file) do |zip|
        zip.put_next_entry("account.json")
        zip.write(JSON.pretty_generate(manifest))

        applications.each_slice(BLOB_BATCH) { |batch| write_blobs(zip, batch) }
      end
      file.flush
      file.rewind
      file
    rescue StandardError
      file&.close!
      raise
    end

    def filename
      "karirkalyan-account-#{Time.zone.today.iso8601}.zip"
    end

    private

    attr_reader :user

    def applications
      @applications ||= user.applications
        .without_blobs
        .select(:posting_snapshot,
                "COALESCE(octet_length(applications.resume), 0) > 0 AS has_resume",
                "COALESCE(octet_length(applications.cover_letter), 0) > 0 AS has_cover_letter")
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
    #
    # posting_snapshot is dropped by that same override for a different reason (index and
    # board fetch every row, and 12k of text per row is blob weight in a text costume), so
    # it has to be merged back, exactly as ApplicationsController#show does. Riding
    # as_json alone quietly made this file's whole promise false: the archive is the leg
    # the user can pull without a provider or a shell, "nothing is lost" is its entire
    # job, and the snapshot is the one column no other export carries: the CSV excludes it
    # by design, and its purpose is surviving a posting that gets taken down.
    def application_json(application)
      application.as_json.merge(
        posting_snapshot:  application.posting_snapshot,
        resume_file:       blob_path_if_present(application, :resume),
        cover_letter_file: blob_path_if_present(application, :cover_letter),
        timeline_entries:  application.timeline_entries.sort_by(&:created_at).as_json
      )
    end

    def blob_path_if_present(application, kind)
      application.read_attribute(:"has_#{kind}") ? blob_path(application, kind) : nil
    end

    def write_blobs(zip, batch)
      by_id = batch.index_by(&:id)
      Application.where(id: by_id.keys).order(:created_at)
                 .pluck(:id, *Application::DOWNLOAD_KINDS).each do |id, *blobs|
        Application::DOWNLOAD_KINDS.zip(blobs).each do |kind, blob|
          next if blob.blank?

          zip.put_next_entry(blob_path(by_id.fetch(id), kind))
          zip.write(blob)
        end
      end
    end

    # Application#download_basename is the one place a PDF gets named, so an archived file and
    # the same file downloaded singly agree — see SPEC.md § Download filenames. The directory
    # is the only thing the archive adds.
    def blob_path(application, kind)
      "#{DIRECTORIES.fetch(kind)}/#{application.download_basename(kind: kind)}"
    end
  end
end
