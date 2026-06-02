module ApplicationFSM
  class InvalidTransitionError < StandardError; end

  TRANSITIONS = [
    { from: "wishlist",     to: "draft"        },
    { from: "draft",        to: "applied"      },

    { from: "applied",      to: "phone_screen" },
    { from: "phone_screen", to: "technical"    },
    { from: "technical",    to: "final_round"  },
    { from: "final_round",  to: "offer"        },
    { from: "offer",        to: "accepted"     },
    { from: "offer",        to: "declined"     },

    { from: "applied",      to: "rejected"     },
    { from: "phone_screen", to: "rejected"     },
    { from: "technical",    to: "rejected"     },
    { from: "final_round",  to: "rejected"     },
    { from: "offer",        to: "rejected"     },

    { from: "applied",      to: "ghosted"      },
    { from: "phone_screen", to: "ghosted"      },
    { from: "technical",    to: "ghosted"      },
    { from: "final_round",  to: "ghosted"      },
    { from: "ghosted",      to: "applied"      },

    { from: "wishlist",     to: "withdrawn"    },
    { from: "draft",        to: "withdrawn"    },
    { from: "applied",      to: "withdrawn"    },
    { from: "phone_screen", to: "withdrawn"    },
    { from: "technical",    to: "withdrawn"    },
    { from: "final_round",  to: "withdrawn"    },

    { from: "rejected",     to: "applied"      },
    { from: "withdrawn",    to: "applied"      }
  ].freeze

  TERMINAL_STATES = %w[accepted declined archived].freeze
  VALID_STATES    = (TRANSITIONS.flat_map { |t| [ t[:from], t[:to] ] } + TERMINAL_STATES).uniq.freeze

  # States an application may be *created* in. The FSM governs transitions
  # (changes after creation); creation sets the initial state. A tracker's users
  # add jobs at whatever stage they're really at — saved, preparing, or already
  # applied — so all three are valid entry points. Later stages are reachable
  # only by transitioning, which keeps the audit trail honest.
  ENTRY_STATES = %w[wishlist draft applied].freeze

  def self.assert_transition!(from, to)
    return if to == "archived" && !TERMINAL_STATES.include?(from)
    unless TRANSITIONS.any? { |t| t[:from] == from && t[:to] == to }
      raise InvalidTransitionError, "No valid transition from '#{from}' to '#{to}'"
    end
  end

  def self.valid_next_states(from)
    return [] if TERMINAL_STATES.include?(from)
    nexts = TRANSITIONS.select { |t| t[:from] == from }.map { |t| t[:to] }
    nexts << "archived" unless nexts.empty?
    nexts
  end
end
