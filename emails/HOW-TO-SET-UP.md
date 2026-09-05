# Setting up the welcome email in beehiiv

The one automation that makes the site's promise true: someone signs up, they
get a complete edition. Follow this once and it runs itself from then on.

**Where you are:** Audience → Automations → your automation, showing a
**Send email** block with a **+ Create email** button.

---

## 1. Create the email

1. Click **+ Create email** inside the Send email block.
2. If beehiiv asks how to start, choose **Blank draft post**.
   *Not* "Template post" — that layers beehiiv's own styling on top of the
   HTML and the two fight each other.

The editor opens. It looks like a normal post editor, which is fine: because
you reached it through the Send email block, it belongs to the automation.

---

## 2. Set the title

Click where it says **New post** and replace it with:

```
Your free edition — the kid who wrote Marvel's best joke
```

Leave the subtitle empty.

---

## 3. Paste the newspaper

1. Click in the body, where it says *Click here to start writing…*
2. Type a forward slash: **`/`** — beehiiv opens a block menu.
3. Type `html` and pick **Custom HTML** (may be called *Code* or *Embed*).
4. Open `emails/welcome-free-edition.html`, select everything
   (**Ctrl+A**), copy (**Ctrl+C**), and paste into the block (**Ctrl+V**).

The whole newspaper is one block — masthead, stories, quiz, red button. Don't
split it up; the layout depends on staying together.

**No Custom HTML block on your plan?** Use `emails/welcome-free-edition.md`
instead and paste it section by section into the normal editor. Plainer, but
it works everywhere.

---

## 4. Subject line and preview text

Look for **Email settings**, the **Email** tab, or a gear icon.

| Field | Value |
|---|---|
| Subject | `Your free edition — the kid who wrote Marvel's best joke` |
| Preview text | `A Make-A-Wish kid wrote one of Marvel's best jokes. Inside: that story, and four more nobody told you.` |

Preview text is the grey line next to the subject in an inbox. Left empty,
mail clients grab the first words of the email, which looks sloppy.

The subject names the strangest specific thing in the email rather than the
product. "Your free edition of The Bloop Times" tells someone what arrived;
this tells them why to open it.

---

## 5. Send yourself a test

Find **Send test** (often under the ⋮ menu or next to Preview). Send it to
your own address and check on your phone:

- Red BU logo top left, on black
- "The Bloop Times" large, with double rules underneath
- Section labels (Behind the Scenes, Blooper of the Week) in red capitals
- The blooper fact sheet in a bordered white box, four labelled rows
- The **IMPROVISED** verdict stamp, red outline, centred
- Three big red numerals in Did You Know?
- A thin black bar halfway down: *become an Insider →*
- The pink-bordered **Insiders Only** box near the bottom
- Black panel at the end with a red **Get Inside Access — $9.99/month** button
- Both upgrade links open `news.bloopuniverse.com/upgrade`

---

## 6. Turn it on

1. Save and close the editor (**Done**, **Save**, or the back arrow).
2. You're back in the workflow. It should read: **Signed up → Send email → Exit**.
3. Click **Publish** at the top right.
4. The label at the top must flip from **Draft** to **Live** or **Published**.

Skipping this step is the usual mistake. A draft automation sends nothing.

---

## 7. Test the whole chain

1. Open **bloopuniverse.com**
2. Click **Get your free edition**
3. Sign up with a private address you don't already use for beehiiv
4. The edition should land within a few minutes

Read it the whole way through on a phone, as a stranger would. It has one
job: make someone who has never heard of you want the Friday edition.

Nothing arrives? Check, in this order: is the automation **Live**; does
Audience → Subscribers list the address you just used; is it sitting in spam.

---

## 8. The follow-up sequence

Most people don't subscribe off the first email. They read it, think *that was
good*, and then get on with their day. Three more letters over two weeks is
where the paid conversions actually come from.

Back in **Audience → Automations → your automation**, add these after the
welcome email:

| Step | Wait | Email | Subject |
|---|---|---|---|
| 2 | 3 days | `followup-1-day3.html` | Indiana Jones didn't win that fight |
| 3 | 4 days | `followup-2-day7.html` | What's actually in the Friday edition |
| 4 | 7 days | `followup-3-day14.html` | The cast knew. Sort of. |

The waits are cumulative, so those land on day 3, day 7 and day 14.

Each one goes in the same way as the welcome email: **Add step → Wait**, set the
delay, then **Add step → Send email → + Create email → Blank draft**, `/`,
**Custom HTML**, paste the file. Subject and preview text are written in a
comment at the top of each file.

### Stop them once someone pays

This matters more than the emails themselves. Nothing sours a new subscriber
faster than being pitched a subscription they already bought.

Look for a **condition**, **filter** or **exit** step in the automation builder
and set it so anyone on the paid tier leaves the sequence. If beehiiv only
offers it per-step, put the check before each of the three sends.

If you genuinely can't find that option, tell me before switching the sequence
on — an unfiltered pitch to paying Insiders is worse than no sequence at all.

### The rest

- **Publish the automation again** after editing. Same trap as the first time:
  edits sit as a draft until you do.
- Send yourself a test of each one, and read them in order. They're written as a
  sequence — day 14 refers back to the free edition.
- The last one says it's the last one. That's deliberate; a stated end reduces
  unsubscribes, so don't quietly add a fourth.
- People already partway through the automation may not pick up the new steps.
  Beehiiv's behaviour there varies, so treat the sequence as applying to new
  sign-ups and don't chase the handful who came before.

---

## Then you're done

The chain runs by itself: video → site → sign-up → free edition → upgrade button.

Next: edition No. 2 on Friday. Use `emails/weekly-template.html` for the email
and `template/edition-template.html` for the web version, and set the post to
**Premium only** in beehiiv so it goes to Insiders.

What goes in each section — and which sources are good enough — is written up
in [CONTENT-PLAYBOOK.md](../CONTENT-PLAYBOOK.md). Read it once before you write
edition No. 2.
