# Perishable immigration facts, in one place so the annual refresh has a single
# address (TODO.md's perishable-facts rule). Every number here is sourced and
# dated; re-confirm against the Immigration Services Agency of Japan (出入国在留
# 管理庁 / MOJ) once a year. Verified 2026-07-21.
module Visa
  # Standard CoE (在留資格認定証明書) processing time for 技術・人文知識・国際業務,
  # the usual status for a software role. The lead-time arithmetic surfaced next
  # to an offer: accept -> assemble documents -> file -> ~this many days to
  # disposition -> start. Budgeting the higher end is the safe move, especially
  # against the spring (April-start) hiring peak the MOJ sheet warns about.
  #
  # Source: MOJ 在留審査処理期間, 令和8年5月許可分 (May 2026): 62.9 days for
  # 技術・人文知識・国際業務, within the official 1-3 month band. Published monthly,
  # so this moves; re-read the latest sheet at refresh time.
  # https://www.moj.go.jp/isa/applications/resources/nyuukokukanri07_00140.html
  COE_LEAD_TIME_DAYS = 63

  # Below this many days on the current status, the days-remaining read turns
  # into a warning. A quarter is enough runway to start a renewal or a change of
  # status without it becoming an emergency.
  RENEWAL_WARNING_DAYS = 90
end
