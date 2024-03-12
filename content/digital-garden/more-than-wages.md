---
title: "The value of your time depends on more than just wages"
date: 2024-02-09
lastMod: 2024-02-09
---

[I think that valuing time at your average wage is mistaken, for at least 3 reasons]():

> 1. The value of a purchased hour depends on more than just wage level. [...] In most instances, the more leisure time you have, the less you value an additional hour of it. [...] Separate from how much work and leisure time you have when deciding to buy an hour, particular hours have characteristics -- energy level, time of day, location, etc. -- that affect their value.
> 2. Most people cannot earn an extra one hour of wages by working one hour more. [...]
> 3. Valuing time is not a static decision problem. [...]

This post addresses the first mistake.

## Think at the margin

Consider an individual deciding how best to allocate time between work $L$, leisure $l$ and worthless time $d$, out of a fixed amount of total time $T$. They have the option of purchasing time-saving services $s$ at price $p_s$. Finally, they value consumption $c$ and leisure according to the utility function

$$U = \alpha \log(l + s) + \beta \log(c)$$

where:

- $α$ and $β$ represent the weights of leisure and consumption,
- consumption $c$ is calculated as the wage $w$, times work hours $L$, minus the cost of time-saving services ($p_s \times s$), and
- $s$ must be at least $0$ and at most $d = T - l - L$.

To find the price at which it is worth purchasing an hour of time-saving service, we compare the marginal utility of leisure to the marginal utility of consumption:

$$MU_{leisure} = \alpha \frac{1}{l + s}$$

$$MU_{consumption} = \beta \frac{1}{c}$$

Setting these equal allows us to solve for the value of time $p_s$:

$$\alpha \frac{1}{l + s} = \beta \frac{1}{wL - p_s s}$$

$$\alpha (wL - p_s s) = \beta (l + s)$$

$$\alpha p_s s = \alpha wL - \beta (l + s)$$

$$p_s = \frac{wL - \frac{\beta}{\alpha} (l + s)}{s}$$

Notice that the individual's value of time:

1. Higher if their wage is higher, yes, but also
2. Higher if they work more hours, or
3. Lower if they have a greater preference for consumption relative to leisure, or
4. Lower the more time they have already purchased.

## What will the hour be used for?

To be written.