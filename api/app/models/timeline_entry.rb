class TimelineEntry < ApplicationRecord
  belongs_to :application
  belongs_to :actor, class_name: "User"

  validates :from_status, :to_status, presence: true
end
