# Phase 6: what to verify by hand

Phase 6 adds photo answers for CQs: take or choose up to 4 photos of your handwritten answer, they are shrunk on the phone, the AI reads the handwriting, you correct the text next to your photos, and the corrected text is marked like a typed answer. The photos are deleted after marking.

The database logic (photo rules, the reading job, the daily cap, who can see what) is covered by automated tests. I also ran the whole flow in the browser on a phone-sized screen with a throwaway student and real Gemini calls (two photos, one removed, reading, correction, marking, photo deleted from storage), then deleted all of it. The steps below are the real-data check, above all with a real phone camera and your real handwriting.

## Setup

1. The migration `20261031013000_cq_photo_answers.sql` is already applied to the Supabase project. If you ever rebuild the project, run all files in `supabase/migrations/` in order.
2. No new environment variables, no new packages. The private `answer-photos` bucket from Phase 1 is used.
3. CQ practice needs approved CQs in a set, as in Phase 5.

## Automated checks

- `npm test` in `app`: 41 tests. New ones cover the reading checks (unsure parts that are not in the text are dropped, unreadable photos rejected), the reading prompt, the photo size maths and the three-step progress bar.
- `supabase/tests/phase6.sql`: paste it into the Supabase SQL editor and run it. The last result must read `ALL PHASE 6 TESTS PASSED`. Everything rolls back.
- `supabase/tests/phase5.sql` was NOT re-run after this migration changed the cap counting and two functions. Run it once, it must still end with `ALL PHASE 5 TESTS PASSED`.

## Checklist

1. **Type or Photo.** On a CQ the question card is followed by two pills, Type and Photo. Type is the old answer box. The pills disappear once the photos are being read.
2. **Take a photo (phone).** "Take a photo" opens the phone camera. "Choose from gallery" lets you pick several photos at once. Each one shows "Shrinking and sending", then a thumbnail. The portrait photo must not appear sideways.
3. **Photo size.** After uploading, look at Storage, bucket `answer-photos`: each file should be about 300 KB or less (my test files were 50 to 60 KB). Photos are stored under your user id and the attempt id.
4. **Limits.** A 5th photo is refused ("up to 4"). "Remove" deletes a photo, and its file disappears from Storage.
5. **Read my handwriting.** The panel shows three steps (Photos received, Reading your handwriting, Checking the text) with the "Estimated" bar and Snake underneath. While it waits you can go to the next question. The reading can take from a few seconds to several minutes when Gemini is busy. In my run one call took over 5 minutes before it answered, the router's 2 minute give-up then moves to another slot.
6. **Check what was read.** Your photos are shown above a text box with the reading. Compare it with your handwriting. Tap a photo to enlarge it. Parts the AI was unsure about appear as orange chips with the reason. Tapping a chip selects that part in the text box and the chip turns grey. A chip also turns grey when you change that part of the text.
7. **Correct and submit.** Edit the text, then "Looks right, submit for marking". The usual marking panel and feedback follow. The feedback is about the text you confirmed, not the raw reading.
8. **Photos deleted after marking.** Once the feedback is ready, the photos are gone from Storage and the screen no longer shows them. Only the text stays.
9. **One grading per answer.** The line "AI gradings used today" goes up by 1 for a photo answer (reading and marking together), not 2. If you have 1 grading left you can still read, correct and mark one photo answer. A reading that fails does not use a grading.
10. **Start over.** On the check screen "Start over with new photos" deletes the photos and the text and takes you back to taking photos. Each answer can be read at most 3 times, then it says to type the answer.
11. **Leave and come back.** Take photos, press Read, close the tab, come back: the reading is waiting in the same question (or still running). Photos you attached but never read are still listed.
12. **Unused photos.** Attach a photo and press "End session" without answering: the photo is deleted at once. Any other leftover photo is deleted by the daily cron after 2 days.
13. **Failed reading.** If the reading fails three times the panel says "Reading did not work" with "Try reading again" and "Start over with new photos". I could not force this in the browser (same reason as the failed-marking panel in Phase 5), so please look at it if it ever happens.
14. **Privacy.** Another student, or the admin, cannot open your photos or readings. Signed out, the photo and upload routes answer 401.
15. **Phone.** One column, large tap targets, no sideways scrolling, the keyboard opens for the text box.

## Known gaps and assumptions

- Only CQs. Numerical problems (`problem`) with the math editor and math rows are Phase 7. The reading already writes equations in the `$...$` format, but the box here is a plain text box.
- The orange "unsure" marks are chips you tap, not underlines inside the text box. The underlined math editor comes with Phase 7.
- One AI grading covers reading and marking of the same answer (plan 5 says the cap counts "gradings and photo transcriptions", this reads it as one use per answer). If you want reading to count separately, it is a small change in `private.grades_used_today`.
- The photo must be a JPEG. The phone converts every photo to JPEG before uploading, other files are refused by the server.
- Reading uses 1 AI call and marking another, so a photo answer takes about twice as long as a typed one when Gemini is slow.
- "Save report PDF", History and the admin storage view are Phase 8.
