# A dynamic model of time-money trade-offs

People who make somewhat explicit time-money trade-offs often use something like their average wage as a proxy for the price at which they are indifferent between spending money to save an hour and spending an hour to save money.

This is a reasonable start, but [I think it's mistaken for at least 3 reasons]():

1. Most people cannot earn an extra one hours of wages by working one hour more. ("Adjust on the intensive margin.")
2. The value of a purchased hour depends on the amount of time currently spent on work and leisure ("marginal value of leisure is decreasing"), as well as factors such as energy levels or time of day.
3. Choices about time-money trade-offs are not static -- the best decision tomorrow depends on the decision today. Indifference prices that do not incorporate this fact might be mistaken.

This post addresses the last mistake.

## Static Model

In [another post](), we found that, with logarithmic utility, the price at which an individual is indifferent between spending money to save an hour and spending an hour to save money is given by:

$$p_s = \frac{\alpha wL - \beta (l + 1)}{\alpha}$$

The individual will want to buy an hour of leisure if the price is less than this, and will want to sell an hour of leisure if the price is more than this.

## Adjusting for Future Wages

Even if you cannot straightforwardly earn an extra one hour of wages by working one hour more, you might be able to earn more in the future by working more now. That is, future wages ($w_2$) can be a function of current leisure hours ($l_1$).

### 2-period model

With a model otherwise similar to the above, adding a second period will not change the result; the indifference price is always the same. Making future wages a function of current work hours changes this.

### Modified Utility

Utility is now given by:

$$U = \alpha log(l_1 + s_1) + \beta log(c_1) + \delta (\alpha log(l_2 + s_2) + \beta log(c_2))$$

where $\delta$ is a discount factor and $w_2 = f(w_1, l_1)$.

### Marginal Utility Analysis

To find the price that equates the marginal utility of leisure to the marginal utility of consumption, we equate the derivatives of the utility function with respect to $l_1$ and $c_1$:

$$MU_{l_1} = \frac{\partial}{\partial l_1} \{\alpha log(l_1 + s_1) + \beta log(c_1) + \delta (\alpha log(l_2 + s_2) + \beta log(c_2))\}$$

$$MU_{l_1} = \alpha \frac{1}{l_1 + s_1} + \frac{\partial}{\partial l_1} \{\delta \beta log(w_2 L_2 - p_s s_2)\}$$

$$MU_{l_1} = \alpha \frac{1}{l_1 + s_1} + \frac{\partial}{\partial l_1} \{\delta \beta log(f(w_1, l_1) L_2 - p_s s_2)\}$$

$$MU_{l_1} = \alpha \frac{1}{l_1 + s_1} + \delta \cdot \beta \frac{f^{'}_{l_1}(w_1, l_1) L_2}{f(w_1, l_1) L_2 - p_s s_2}$$

$$MU_{c_1} = \beta \frac{1}{c_1}$$

Setting these equal gives us the indifference price for time-saving services in the first period:

$$MU_{l_1} = MU_{c_1}$$

$$\alpha \frac{1}{l_1 + s_1} + \delta \cdot \beta \frac{f^{'}_{l_1}(w_1, l_1) L_2}{f(w_1, l_1) L_2 - p_s s_2} = \beta \frac{1}{w_1 L_1 - p_s s_1}$$

$$\alpha (w_1 L_1 - p_s s_1) (f(w_1, l_1) L_2 - p_s s_2) + \delta \cdot \beta f^{'}_{l_1}(w_1, l_1) L_2(w_1 L_1 - p_s s_1) (l_1 + s_1) = \beta (l_1 + s_1) (f(w_1, l_1) L_2 - p_s s_2)$$

$$\alpha w_1 L_1 f(w_1, l_1) L_2$$

Differentiating by $L_1$ to find equa

Acknowledging future wages, we adapt our approach to include the potential increase in future earnings:

$$p_s = \frac{\alpha wL + \delta \cdot \alpha f^{'}(L) - \beta (l + s) f(L)L}{\alpha + \beta (l + s)}$$

This equation highlights how the indifference price for time-saving services is influenced by:
- Current wage rate ($w$) and work hours ($L$),
- The derivative of future wages with respect to current hours ($f^{'}(L)$),
- The individual's preferences for leisure and consumption ($α$, $β$),
- The discount factor for future utility ($δ$).

## Key Insights

1. **Complex Trade-offs**: The decision to purchase time-saving services involves balancing the immediate utility of leisure against the utility of consumption, while also considering the long-term benefits of current work hours on future wages.
2. **Future Wages Impact**: Incorporating future wages into the model reveals the investment aspect of current work hours, emphasizing the role of labor not just for immediate income but also for enhancing future earning potential.
3. **Indifference Price Calculation**: The derived formula for $p_s$ provides a way to quantify the price at which an individual would be indifferent to buying an hour of leisure, factoring in both current and anticipated future economic conditions.

This theoretical exploration underscores the intricacies of valuing time, especially in the context of fixed work hours and the potential for future wage growth. It offers a mathematical foundation for understanding the economic rationale behind purchasing time-saving services and the broader implications of work-leisure decisions on long-term well-being.
