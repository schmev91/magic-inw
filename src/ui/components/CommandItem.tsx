import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { collapseCommand, truncate } from '../../core/ui-utils.js';
import { theme } from '../../core/theme.js';
import { Scope } from '../../core/types.js';

interface Props {
  label: string;
  isSelected?: boolean;
  /** The command body. ink-select-input spreads the item object as props. */
  command?: string;
  scope?: Scope;
  /** False when no project scope is active, which hides the flag column. */
  showScopeFlags?: boolean;
}

const ALIAS_WIDTH = 20;
const FLAG_WIDTH = 4;

export function CommandItem({
  label,
  isSelected = false,
  command = '',
  scope = 'global',
  showScopeFlags = false,
}: Props) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;

  const flagWidth = showScopeFlags ? FLAG_WIDTH : 0;
  const available = terminalWidth - ALIAS_WIDTH - flagWidth - 6;

  return (
    <Box flexDirection="row">
      {showScopeFlags && (
        <Box width={FLAG_WIDTH}>
          <Text color={scope === 'project' ? theme.projectFlagColor : theme.globalFlagColor}>
            {scope === 'project' ? '[p]' : '[g]'}
          </Text>
        </Box>
      )}

      <Box width={ALIAS_WIDTH}>
        <Text color={isSelected ? theme.highlightColor : theme.aliasColor} bold={isSelected}>
          {truncate(label, ALIAS_WIDTH - 1)}
        </Text>
      </Box>

      <Box marginLeft={1}>
        <Text color={theme.commandColor}>{truncate(collapseCommand(command), available)}</Text>
      </Box>
    </Box>
  );
}
