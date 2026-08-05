class AddOfferIndexToTimelineEntries < ActiveRecord::Migration[8.1]
  def change
    # Serves the first-offer subquery behind avg_days_to_offer
    # (Api::V1::DashboardController#compute_stats), which is a DISTINCT ON over
    # timeline_entries filtered to to_status = 'offer'. Without it that read was
    # a sequential scan plus sort of the whole table, and the stats cache key
    # includes MAX(updated_at), so any edit to any application sends the next
    # dashboard through it again.
    #
    # Partial rather than a plain index on to_status: 'offer' is one of thirteen
    # states and the only one this query asks for, so indexing the rest would
    # pay write amplification on every transition to buy nothing. The column
    # order matches the DISTINCT ON and its ORDER BY, so the index supplies the
    # sort as well as the filter.
    add_index :timeline_entries, [ :application_id, :created_at ],
      where: "to_status = 'offer'",
      name:  "index_timeline_entries_on_offer"
  end
end
