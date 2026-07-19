import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../core/theme.js';

interface Props {
  value: string;
  placeholder?: string;
}

/**
 * Display-only search box.
 *
 * Deliberately not ink-text-input: that component consumes every keystroke it
 * receives and inserts the raw letter even when key.ctrl is set, so having it
 * mounted alongside the picker's own handler meant action keys typed
 * themselves into the query. ListView owns all key handling now; this just
 * renders the current value.
 */
export function SearchInput({ value, placeholder = 'alias or command text...' }: Props) {
  return (
    <Box borderStyle="round" borderColor={theme.searchPromptColor} paddingX={1}>
      <Box marginRight={1}>
        <Text bold color={theme.searchPromptColor}>Search:</Text>
      </Box>
      {value.length > 0 ? (
        <Text>
          {value}
          <Text inverse> </Text>
        </Text>
      ) : (
        <Text dimColor>
          <Text inverse> </Text>
          {placeholder}
        </Text>
      )}
    </Box>
  );
}
