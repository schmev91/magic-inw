import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from '../../core/theme.js';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /**
   * False while an inline edit is open. Both text inputs are mounted at once,
   * so without this the keystrokes meant for the editor also filter the list.
   */
  focus?: boolean;
}

export function SearchInput({ value, onChange, focus = true }: Props) {
  return (
    <Box borderStyle="round" borderColor={theme.searchPromptColor} paddingX={1}>
      <Box marginRight={1}>
        <Text bold color={theme.searchPromptColor}>Search:</Text>
      </Box>
      <TextInput value={value} onChange={onChange} focus={focus} placeholder="alias or command text..." />
    </Box>
  );
}
