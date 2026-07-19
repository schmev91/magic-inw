import meow from 'meow';

export function buildCli(head: string[]) {
  return meow(
    `
  Usage
    $ inw                          Open the command picker
    $ inw <alias>                  Run a saved command
    $ inw <alias> <command...>     Save a command globally
    $ inw <alias> -- <args...>     Run a saved command with extra arguments

  Scope
    -p, --project   Act on this project's commands (nearest .inw_commands)
    -g, --global    Act on your global commands (~/.inw_saved_commands)

    Without a scope flag, running an alias prefers the project's version
    and falls back to global; saving writes to global.

  Examples
    $ inw mem memory                  Save "memory" as alias "mem"
    $ inw mem                         Run it
    $ inw -p deploy ./deploy.sh       Save to this project
    $ inw build -- --watch            Run "build" with --watch appended

  Aliases are lowercase, and may contain digits, hyphens, and underscores.
`,
    {
      argv: head,
      importMeta: import.meta,
      // The `--` split happens in cli/argv.ts before meow sees argv, and
      // unknown flags belong to the command being saved, not to inw.
      allowUnknownFlags: false,
      flags: {
        project: { type: 'boolean', shortFlag: 'p', default: false },
        global: { type: 'boolean', shortFlag: 'g', default: false },
      },
    },
  );
}
