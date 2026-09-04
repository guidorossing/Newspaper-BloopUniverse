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
Your free edition of The Bloop Times
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
| Subject | `Your free edition of The Bloop Times` |
| Preview text | `Marvel takes so bad they had to reshoot the whole scene.` |

Preview text is the grey line next to the subject in an inbox. Left empty,
mail clients grab the first words of the email, which looks sloppy.

---

## 5. Send yourself a test

Find **Send test** (often under the ⋮ menu or next to Preview). Send it to
your own address and check on your phone:

- Red BU logo top left, on black
- "The Bloop Times" large, with double rules underneath
- Section labels (Front Page, Behind the Bloop) in red capitals
- Quiz in a bordered box, answers in grey underneath
- Black panel at the bottom with a red **Get Inside Access — $9.99/month** button
- The button opens `news.bloopuniverse.com/upgrade`

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

Nothing arrives? Check, in this order: is the automation **Live**; does
Audience → Subscribers list the address you just used; is it sitting in spam.

---

## Then you're done

The chain runs by itself: video → site → sign-up → free edition → upgrade button.

Next: edition No. 2 on Friday. Use `emails/weekly-template.html` for the email
and `template/edition-template.html` for the web version, and set the post to
**Premium only** in beehiiv so it goes to Insiders.
