import { describe, expect, it } from 'vitest';
import { clipSentence, describeCommand, hostnameOf, mapToolCall } from './activityMapper.ts';

const step = (n: string, i: Record<string, unknown> = {}) => mapToolCall(n, i).step;

describe('activity mapper (employee-runtime.md 4.4)', () => {
  it('office.set_activity: the office tool records its own step', () => {
    expect(mapToolCall('mcp__office__set_activity', { sentence: 'Fixing the cart total' })).toMatchObject({ step: null, recordedByOffice: true });
  });

  it('desktop.launch_app: "Opened {app name}" or the host when an address is opened', () => {
    expect(step('mcp__desktop__launch_app', { name: 'firefox' })).toBe('Opened Firefox');
    expect(step('mcp__desktop__launch_app', { launch_path: '/usr/bin/xfce4-terminal' })).toBe('Opened Xfce4 terminal');
    expect(step('mcp__desktop__launch_app', { bundle_id: 'org.mozilla.firefox' })).toBe('Opened Firefox');
    expect(step('mcp__desktop__launch_app', { name: 'firefox', urls: ['https://www.example.com/path?q=1'] })).toBe('Opened example.com');
    expect(step('mcp__desktop__launch_app', { launch_path: 'xfce4-terminal --working-directory=$HOME/work/shop --hold -e "python3 -m unittest -v"' })).toBe('Opened Xfce4 terminal');
    expect(step('mcp__desktop__launch_app', { name: 'Google Chrome' })).toBe('Opened Google Chrome');
    expect(step('mcp__desktop__launch_app', {})).toBe('Opened an app');
    expect(mapToolCall('mcp__desktop__launch_app', { name: 'firefox' }).failed).toBe("Couldn't open Firefox");
  });

  it('desktop.browser_navigate: "Opened {hostname without www}"', () => {
    expect(step('mcp__desktop__browser_navigate', { url: 'https://www.example.org/a' })).toBe('Opened example.org');
    expect(step('mcp__desktop__browser_navigate', { url: 'example.org' })).toBe('Opened example.org');
  });

  it('space.shell, space.write_file', () => {
    expect(step('mcp__space__shell', { command: 'rm -rf /secret && git push' })).toBe('Pushed the branch');
    expect(step('mcp__space__shell', { command: 'echo working' })).toBe('Ran a command');
    expect(step('mcp__space__shell', {})).toBe('Ran a command');
    expect(step('mcp__space__write_file', { path: '~/work/site/index.html', content: 'x' })).toBe('Wrote index.html');
    expect(mapToolCall('mcp__space__write_file', { path: '/a/b/notes.txt' }).failed).toBe("Couldn't write notes.txt");
    expect(mapToolCall('mcp__space__shell', { command: 'x' }).failed).toBe("Couldn't run a command");
    expect(step('mcp__space__read_file', { path: '~/work/shop/cart.js' })).toBe('Read cart.js');
    expect(mapToolCall('mcp__space__read_file', { path: '/a/b/x.md' }).failed).toBe("Couldn't read x.md");
    expect(step('mcp__space__read_file', {})).toBe('Read a file');
    expect(step('mcp__space__edit_file', { path: '~/work/cart.js' })).toBe('Edited cart.js');
  });

  it('shell commands are named by their purpose', () => {
    const cases: Array<[string, string]> = [
      ['npm test', 'Ran the tests'],
      ['cd ~/work/shop && npm test 2>&1 | tail -20', 'Ran the tests'],
      ['npm run test -- --watch=false', 'Ran the tests'],
      ['npx vitest run', 'Ran the tests'],
      ['pytest -q', 'Ran the tests'],
      ['python3 -m pytest tests/', 'Ran the tests'],
      ['node --test', 'Ran the tests'],
      ['go test ./...', 'Ran the tests'],
      ['git commit -m "Fix the cart total"', 'Committed the change'],
      ['git add -A && git commit -m "x && y"', 'Committed the change'],
      ['git push origin fix-cart', 'Pushed the branch'],
      ['git checkout -b fix/cart-total', 'Started a branch'],
      ['git switch -c fix/cart-total', 'Started a branch'],
      ['git status', 'Checked the repository'],
      ['git diff HEAD~1', 'Checked the repository'],
      ['git log --oneline | head', 'Checked the repository'],
      ['git add .', 'Staged the changes'],
      ['git init', 'Set up a repository'],
      ['python3 -m http.server 8000 &', 'Started a local server'],
      ['nohup npm run dev > /tmp/dev.log 2>&1 &', 'Started a local server'],
      ['npm start', 'Started a local server'],
      ['ls -la ~/work', 'Looked through the files'],
      ['cat package.json', 'Looked through the files'],
      ['grep -rn total src', 'Looked through the files'],
      ['find . -name "*.js"', 'Looked through the files'],
      ['cd ~/work && ls', 'Looked through the files'],
      ['mkdir -p ~/work/shop/tests', 'Organised files'],
      ['cp a.txt b.txt', 'Organised files'],
      ['mv old.js new.js', 'Organised files'],
      ['python3 solve.py', 'Ran solve.py'],
      ['python3 ~/work/shop/scripts/seed.py --fast', 'Ran seed.py'],
      ['node build/index.js', 'Ran index.js'],
      ['bash ./setup.sh', 'Ran setup.sh'],
      ['python3 - <<EOF\nimport os\nprint(os.getcwd())\nEOF', 'Ran a Python snippet'],
      ['python3 -c "print(1)"', 'Ran a Python snippet'],
      ['curl -s http://localhost:8000/cart', 'Fetched a page'],
      ['wget https://example.com/a.zip', 'Fetched a page'],
      ['npm install express', 'Installed express'],
      ['npm i -D vitest@2.1.0', 'Installed vitest'],
      ['pip install requests', 'Installed requests'],
      ['pip3 install -r requirements.txt', 'Installed dependencies'],
      ['npm install', 'Installed dependencies'],
      ['sudo apt-get install -y ripgrep', 'Installed ripgrep'],
      ['npm run build', 'Built the project'],
      ['sed -i "s/a/b/" src/cart.js', 'Edited cart.js'],
      ['cat > CHANGELOG.md <<EOF\n## Fixed\n- git push the cart\nEOF', 'Wrote CHANGELOG.md'],
      ['echo "hello" > notes.txt', 'Wrote notes.txt'],
      ['bash -lc "cd ~/work/shop && npm test"', 'Ran the tests'],
      ['DISPLAY=:1 xfce4-terminal &', 'Opened Xfce4 terminal'],
      ['echo "git push" && cd ~/work', 'Ran a command'],
      ['cd ~/work', 'Ran a command'],
    ];
    for (const [cmd, want] of cases) expect(describeCommand(cmd) ?? 'Ran a command', cmd).toBe(want);
    expect(describeCommand('')).toBeNull();
    expect(step('mcp__space__shell', { command: 'git commit -m x' })).toBe('Committed the change');
  });

  it('shell sentences stay short and never carry a path or the command text', () => {
    for (const cmd of ['python3 /very/long/path/' + 'x'.repeat(60) + '.py', 'npm install ' + 'p'.repeat(80), 'npm run ' + 'z'.repeat(80)]) {
      const s = describeCommand(cmd)!;
      expect(s.length, cmd).toBeLessThanOrEqual(40);
      expect(s).not.toMatch(/\//);
    }
    expect(describeCommand('export API_KEY=sk-secret-123 && curl -H "Authorization: Bearer sk-secret-123" https://x.test')).toBe('Fetched a page');
    expect(describeCommand('git commit -m "token sk-abc"')).not.toMatch(/sk-/);
  });

  it('text typed into a terminal and sent with Enter is described like a shell command', () => {
    expect(step('mcp__desktop__type_text', { text: 'npm test\n' })).toBe('Ran the tests');
    expect(step('mcp__desktop__type_text', { text: 'npm test' })).toBeNull();
    expect(step('mcp__desktop__type_text', { text: 'hello world\n' })).toBeNull();
    expect(mapToolCall('mcp__desktop__type_text', { text: 'npm test\n' }).family).toBe('desktop');
  });

  it('desktop.kill_app names the app', () => {
    expect(step('mcp__desktop__kill_app', { name: 'firefox' })).toBe('Closed Firefox');
    expect(step('mcp__desktop__kill_app', { pid: 12 })).toBeNull();
  });

  it('WebSearch and WebFetch', () => {
    expect(step('WebSearch', { query: 'secret plans' })).toBe('Searched the web');
    expect(step('WebFetch', { url: 'https://docs.python.org/3/' })).toBe('Read docs.python.org');
    expect(mapToolCall('WebFetch', { url: 'https://docs.python.org/3/' }).failed).toBe("Couldn't read docs.python.org");
    expect(mapToolCall('WebSearch', { query: 'x' }).family).toBe('web');
  });

  it('office.message_colleague: "Messaged {first name}" with a peer (the supervisor records it)', () => {
    const m = mapToolCall('mcp__office__message_colleague', { to: 'Ines', text: 'Where is the logo?' });
    expect(m.step).toBe('Messaged Ines');
    expect(m.peer).toMatchObject({ direction: 'to', text: 'Where is the logo?' });
    expect(m.recordedByOffice).toBe(true);
  });

  it('gives no step for everything in OBSERVE and for individual clicks, keys and scrolls', () => {
    for (const t of ['list_apps', 'list_windows', 'get_window_state', 'get_desktop_state', 'get_screen_size', 'get_cursor_position', 'zoom', 'verify_state', 'get_guide', 'click', 'double_click', 'right_click', 'drag', 'scroll', 'type_text', 'press_key', 'hotkey', 'set_value', 'run_steps', 'move_cursor']) {
      const m = mapToolCall(`mcp__desktop__${t}`, { text: 'x' });
      expect(m.step, t).toBeNull();
      expect(m.family, t).toBe('desktop');
    }
  });

  it('classifies the tool family for opening a task', () => {
    expect(mapToolCall('mcp__space__shell').family).toBe('space');
    expect(mapToolCall('mcp__space__read_file').family).toBe('space');
    expect(mapToolCall('mcp__office__message_user').family).toBeNull();
    expect(mapToolCall('mcp__host__click').family).toBe('desktop');
  });

  it('maps TodoWrite to the plan (completed becomes done)', () => {
    const m = mapToolCall('TodoWrite', {
      todos: [
        { content: 'Read the brief', status: 'completed', activeForm: 'Reading' },
        { content: 'Write the page', status: 'in_progress', activeForm: 'Writing' },
        { content: 'Check it', status: 'pending', activeForm: 'Checking' },
      ],
    });
    expect(m.plan).toEqual([
      { title: 'Read the brief', status: 'done' },
      { title: 'Write the page', status: 'in_progress' },
      { title: 'Check it', status: 'pending' },
    ]);
    expect(m.step).toBeNull();
    expect(m.family).toBeNull();
  });

  it('keeps every sentence to 40 characters with no path, id or tool name', () => {
    const long = step('mcp__desktop__launch_app', { name: 'a-very-long-application-name-that-goes-on-and-on' })!;
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
    const f = step('mcp__space__write_file', { path: `~/work/${'x'.repeat(80)}.txt` })!;
    expect(f.length).toBeLessThanOrEqual(40);
    for (const s of [step('mcp__space__write_file', { path: '/etc/passwd' }), step('mcp__desktop__launch_app', { launch_path: '/usr/bin/firefox' })]) {
      expect(s).not.toMatch(/\/|mcp__|~/);
    }
  });

  it('unknown tools make no step', () => {
    expect(mapToolCall('mcp__nope__x')).toEqual({ family: null, step: null, failed: null });
    expect(mapToolCall('Bash').step).toBeNull();
  });

  it('helpers', () => {
    expect(hostnameOf('https://www.a.com/x')).toBe('a.com');
    expect(hostnameOf('')).toBe('');
    expect(clipSentence('  hello   world ')).toBe('hello world');
  });
});
