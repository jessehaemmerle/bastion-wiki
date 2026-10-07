import hljs from 'highlight.js/lib/core';
import { common, createLowlight } from 'lowlight';
import apache from 'highlight.js/lib/languages/apache';
import awk from 'highlight.js/lib/languages/awk';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import nginx from 'highlight.js/lib/languages/nginx';
import nix from 'highlight.js/lib/languages/nix';
import pgsql from 'highlight.js/lib/languages/pgsql';
import powershell from 'highlight.js/lib/languages/powershell';
import properties from 'highlight.js/lib/languages/properties';
import puppet from 'highlight.js/lib/languages/puppet';
import routeros from 'highlight.js/lib/languages/routeros';
import vim from 'highlight.js/lib/languages/vim';

const grammars = { ...common, apache, awk, dockerfile, dos, nginx, nix, pgsql, powershell, properties, puppet, routeros, vim };
for (const [name, grammar] of Object.entries(grammars)) hljs.registerLanguage(name, grammar);
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['ps', 'ps1', 'pwsh'], { languageName: 'powershell' });
hljs.registerAliases(['bat', 'cmd'], { languageName: 'dos' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['conf', 'cfg', 'toml', 'systemd'], { languageName: 'ini' });
hljs.registerAliases(['hcl', 'terraform', 'tf'], { languageName: 'ini' });
hljs.registerAliases(['text', 'txt', 'log'], { languageName: 'plaintext' });

export const lowlight = createLowlight(grammars);
lowlight.registerAlias({ bash: ['sh', 'zsh', 'console'], powershell: ['ps', 'ps1', 'pwsh'], dos: ['bat', 'cmd'], yaml: ['yml'], ini: ['conf', 'cfg', 'toml', 'systemd', 'hcl', 'terraform', 'tf'], plaintext: ['text', 'txt', 'log'] });

/** Languages offered in the editor's code block picker */
export const CODE_LANGUAGES = [
  ['bash', 'Bash / Shell'], ['powershell', 'PowerShell'], ['dos', 'Batch (cmd)'], ['yaml', 'YAML'], ['json', 'JSON'],
  ['ini', 'INI / Conf / TOML'], ['nginx', 'Nginx'], ['apache', 'Apache'], ['dockerfile', 'Dockerfile'], ['sql', 'SQL'],
  ['pgsql', 'PostgreSQL'], ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['go', 'Go'],
  ['xml', 'XML / HTML'], ['properties', 'Properties'], ['puppet', 'Puppet'], ['routeros', 'RouterOS'], ['nix', 'Nix'],
  ['vim', 'Vimscript'], ['awk', 'AWK'], ['diff', 'Diff'], ['makefile', 'Makefile'], ['perl', 'Perl'], ['ruby', 'Ruby'],
  ['php', 'PHP'], ['rust', 'Rust'], ['java', 'Java'], ['csharp', 'C#'], ['css', 'CSS'], ['markdown', 'Markdown'],
  ['plaintext', 'Text / Log'], ['mermaid', 'Mermaid-Diagramm'],
];

export { hljs };
