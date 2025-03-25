---
title: "Selected takes on AI, Mar 2025"
date: 2025-03-24
lastMod: 2025-03-24
---

In the past couple of months I’ve contributed to a series of papers — [RE-Bench](https://arxiv.org/abs/2411.15114), [HCAST](https://arxiv.org/abs/2503.17354), and, bringing them together, [Measuring AI Ability to Complete Long Tasks](https://arxiv.org/abs/2503.14499) — that I think have painted a clearer picture of AI progress. ([This blog post]([https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/) on the latter paper provides helpful background.)

Here are some takes informed by the outputs of these projects.

**(It’s totally wild but I think robustly true that) recent historical progress in AI has followed remarkably steady trends.**

We see this with scaling laws for loss in data and parameter count, but also in the central RE-Bench and Measuring AI Ability to Complete Long Tasks plots.

My experience inside METR has only made this take feel more viscerally correct. I remember staring at best-of-{2,4,6,8,16} results on RE-Bench, hearing that lines would start to bend, then extending to {32,64,128+} and seeing no signs of bending. I remember contributing to the plot of different model’s task length horizon over calendar time, having no a priori reason for thinking the line should be straight (in log space!) beyond that being true for all lines in AI, then seeing the extremely straight output. (Followed by a lot of unsuccessful poking at this central result, documented in the paper.)

Of course, none of this is to say that curves will not bend. 

(But in which direction?)

**The uptick at the end of the task length over time plot is maybe understated.**

Belying popular narrative, progress on the task length over time plot in 2024 appears to be slightly steeper than pre-2024 progress. The change in trend looks to be within statistical noise. Regardless, I think people are still sleeping on how surprising recent reasoning model results have been. This progress seems to me to have two important implications. First, that we have figured out (scalable?) pipelines for (loosely speaking) having LLMs teach themselves to perform better in environments where it is possible albeit unlikely that they sometimes take performant actions/get correct answers, steepening the task length curve. Second, that the slope of the post-training task length curve has been steepening in pre-training compute.

On the other hand, slowed pre-training scaling laws might imply a slower exponential over calendar time. I’m unclear on how these factors might net out.

**Current performance is underrated, even at the frontier.**

[Tweet on this in the context of elicitation effort](https://x.com/joel_bkr/status/1890539509613277269).

[Twitter thread on this in the context of human comparisons](https://x.com/joel_bkr/status/1860069848749080620).

**Model intelligence is really confusing.**

I think it just is correct that models both show signs of being able to complete long-horizon, very challenging tasks successfully, and also that they are totally unhelpful for some workflows, owing to lack of context on the users work, poor UI, and lack of robustness. 

[In some ways intelligence has turned out to be a lot more straightforward than I might have expected](https://www.youtube.com/watch?v=IMkqAUsVAfc), yet the topology is a lot weirder.

My current guess is that at least poor UI and lack of robustness will be solved by just throwing more compute + human effort at the problem.

**Timelines…**

It seems to me that you should have somewhat short timelines:

1. Naive trend extrapolation seems to backtest as the best forecasting strategy through the past several orders of magnitude. On this method, we might get general computer-use agents in the next 1-2 years, 1-month AGIs in 3-4 years.
    - Any signs of this slowing down seem to me to be barely empirical/rely on special pleading (e.g. recent non-reasoning being less impressive than expected, even as actual-frontier models stay steady or even speed up). Special pleading as a heuristic backtests terribly through the past several orders of magnitude.
    - Signs of the trend speeding up are also not yet very empirical (e.g. my suggestion above that progress might be speeding up because RL is beginning to work).
    - (FWIW I’m not clear that task length horizon is a great frame. It is indeed sensitive to task distribution and degree of robustness, and feels like it won’t cash out in the things I most care about.)
2. Model capabilities today are already remarkable. 
    - There plausibly aren’t that many more steps left to unlock.
    - Also, there are sparks of occasionally being able to do even more remarkable things. (See e.g. RE-Bench results or FrontierMath o3 results.) Previously when this has been the case, practitioners have been able to turn occasional, remarkable behavior into default behavior via distillation.
3. People with short timelines seem to have better forecasting track records. (With apologies for cherry-picking, see [Daniel Kokotajlo](https://www.lesswrong.com/posts/6Xgy6CAf2jqHhynHL/what-2026-looks-like) vs. [Gary Marcus](https://benjamintodd.substack.com/p/gary-marcus-says-ai-cant-do-things).)

That said, I think I have longer timelines vs. my colleagues. Some unclear gestures as to why this might be the case:

1. I think reliability/robustness might be somewhat more important than they expect, and I that progress on this in practice might be meaningfully slower than they expect.
    - This is related to [my tweet about capabilities/elicitation effort at the frontier](https://x.com/joel_bkr/status/1890539509613277269). I expect my colleagues to continue to be unusually fast adopters + talented engineers even relative to the ML frontier -> in practice people will have access to weaker capabilities than are possible at the time -> similar level of capabilities will take longer to access.
2. I expect more weirdness in the ‘topology of intelligence’ or whatever. It would have been difficult for me to articulate the present situation with ‘benchmark-brained’ models previously. I expect something similar might be true w.r.t. the future.
3. I continue to have this intuition from economics that many technological capabilities which one expects to be substituting are actually augmenting, in addition to my strong respect for hard-to-articulate bottlenecks.
    - To be clear this mostly points to bearishness on short-term job loss, which is totally compatible with scary AI R&D automation in the short-term.

Overall, my hand-wavey guess is something like: 6-month doubling time, starting from 8x lower-base -> about 5 years to 1-month AGIs; this will feel deficient in some respect, but sufficient for crazy things to start happening.

**METR is fantastic and you should join.**

[Hiring page link](https://hiring.metr.org/).