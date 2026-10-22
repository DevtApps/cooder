import * as React from 'react';

/**
 * Base UI swaps the `asChild` prop for `render`. Triggers keep accepting
 * `asChild` so call sites read the same: the single child becomes the element.
 */
export function renderAsChild(
  asChild: boolean | undefined,
  children: React.ReactNode
): { render?: React.ReactElement; children?: React.ReactNode } {
  if (asChild && React.isValidElement(children)) return { render: children };
  return { children };
}
