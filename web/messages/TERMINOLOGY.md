# Japanese FSM terminology

The 13 FSM state names are the strings a Japanese reviewer reads first, and most have no clean
one-word equivalent. These are chosen to match how Japanese job boards and recruiters actually
label the stages, not to translate the English literally. Recorded here so they are not
second-guessed later.

| State | Japanese | Why |
|---|---|---|
| `wishlist` | 検討中 | "Under consideration." Boards use 気になる ("interested"), but that describes a *button*, not a stage. |
| `draft` | 下書き | Standard. |
| `applied` | 応募済み | Standard. |
| `phone_screen` | カジュアル面談 | The literal 電話面接 is misleading — Japanese hiring calls the recruiter's first conversation a カジュアル面談, and it is rarely a phone call. |
| `technical` | 技術面接 | Covers both interview and take-home; 技術選考 would imply a gate. |
| `final_round` | 最終面接 | Standard. |
| `offer` | 内定 | Exactly this concept: a formal, binding-by-custom offer of employment. Not オファー. |
| `accepted` | 内定承諾 | The set phrase for accepting an 内定. |
| `rejected` | 不採用 | Company-side rejection. Not 拒否, which implies refusing a person. |
| `ghosted` | 音信不通 | "Contact has ceased." No loanword equivalent; ゴースト reads as a literal ghost. |
| `declined` | 内定辞退 | Candidate declines the **offer**. |
| `withdrawn` | 選考辞退 | Candidate withdraws from the **selection process**, before any offer. |
| `archived` | アーカイブ済み | Standard. |

The `declined` / `withdrawn` pair is the one `TODO.md` flagged as tripping people up in English.
Japanese disambiguates it for free: 内定辞退 declines an offer, 選考辞退 exits the process. The
distinction is in the noun, so the two can never be confused the way "declined" and "withdrawn"
are.
