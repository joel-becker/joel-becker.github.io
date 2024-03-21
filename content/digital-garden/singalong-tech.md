---
title: "SingalongTech"
date: 2024-03-20
lastMod: 2024-03-20
---

My friend Rob created [this helpful app](https://521.glitch.me/) for proposing and voting on songs to sing along to. It came to mind a couple of months later, when I joined my first Manifold hackathon.

Mash-ups are one of my favorite things about sing-alongs. They can sound great, and often lead to [comic surprise](https://en.wikipedia.org/wiki/Theories_of_humor#Incongruity_theory). Consider some of my favorites:

1. i - III - VII - IV: Wonderwall, Boulevard of Broken Dreams, Mad World
2. I - VII - IV - I: Sweet Child O' Mine (verses), Take Your Mama, Music In Me, Safety Dance (almost), Champagne Supernova (almost)
3. I - vi - IV - V - I: Stand By Me, Beautiful Girls, I'll Follow You Into The Dark (verses, almost)
4. i - V - iii - IV - V: Baby One More Time, Alexander Hamilton (almost), Hotel California (ok this one is a stretch)

These can be hard to find except through trial-and-error... until LLMs.

Behold, my joint-winning hackathon project, the [mash-up generator](https://github.com/joel-becker/mashup-generator). (Apologies that the code is so untidy/bad and the project very unfinished. Please feel free to further develop this idea, then send me a link or PR!)

The [main workflow](https://github.com/joel-becker/mashup-generator/blob/main/test.py) is:

1. Scrape song chords from ultimate guitar, clean the html aggressively.
2. Ask GPT-4 to write a clean version of the main chord progression, transposed to C or Am, getting rid of embellishments.
3. One-hot encode the chords in each position in the sequence.
4. Apply a similarity metric to the encoded sequences, and return songs with the most similar sequences.

A neat first try. Some obvious improvements for future versions:

1. Instead of scraping ultimate guitar, use a multimodal LLM to directly transcribe audio to chords.
2. Do a better job cleaning chord progressions, use roman numerals, encode speed and time signature.
3. Rather than one-hot encoding chords, maybe multi-hot encode the notes of each chord. (For the purpose of mash-ups of songs with imperfectly similar chord progressions, it often sounds fine to use an unusual but more congruent base note with the incongruous chord, so long as the respective triads share some notes.)
4. Have the similarity metric account for more information.