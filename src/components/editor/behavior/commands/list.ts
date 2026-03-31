/**
 * Markdown Behavior - List Commands
 * Ordered/unordered list toggles
 */

import { type StateCommand } from '@codemirror/state';
import type { OrderedListMode } from '../../../../types';
import {
  toggleUnorderedList as newToggleUnorderedList,
  toggleOrderedList as newToggleOrderedList,
} from '../../nestedListCommands';

export const toggleUnorderedList: StateCommand = ({ state, dispatch }): boolean => {
  return newToggleUnorderedList({ state, dispatch });
};

export const toggleOrderedList: StateCommand = ({ state, dispatch }): boolean => {
  return createToggleOrderedList('strict')({ state, dispatch });
};

export function createToggleOrderedList(orderedListMode: OrderedListMode): StateCommand {
  return ({ state, dispatch }): boolean => {
    const cmd = newToggleOrderedList({ strictMode: orderedListMode === 'strict' });
    return cmd({ state, dispatch });
  };
}
