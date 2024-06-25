---
title: "SingalongTech"
date: 2024-03-20
lastMod: 2024-06-25
---

My friend Rob created [this helpful app](https://521.glitch.me/) for proposing and voting on songs to sing along to. It came to mind a couple of months later, when I joined my first Manifold hackathon.

[For background, I love incongruent mash-ups](https://joel-becker.com/digital-garden/mashups/). These can be hard to find except through trial-and-error... until LLMs.

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