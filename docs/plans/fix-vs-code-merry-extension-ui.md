# Plan: Extension Full Restructuring — TreeView Fix + CodeLens

## Context

현재 extension이 `pubspec.yaml`과 외부 스크립트 파일(`merry.yaml` 등)을 정상적으로 파싱하지만 사이드바 TreeView에 아무것도 표시되지 않는다. 원인은 크게 두 가지다:

1. **Async 초기화 경쟁 조건**: `MerryScriptsProvider` 생성자 안에서 `this.reload()`를 호출하지만 await하지 않아, `registerTreeDataProvider` 호출 시점에 `nodes`가 비어있다. VS Code가 `getChildren()`을 최초 호출할 때 빈 배열을 받고, 이후 `onDidChangeTreeData` 이벤트가 발화되어야만 업데이트되는데 이 UX가 깨져 있다.

2. **미구현 기능**: 스크립트 파일을 에디터에서 열었을 때 각 명령어 위에 녹색 실행 버튼(CodeLens)을 표시하는 기능이 없다.

추가로 `package.json`에 `installCli` 커맨드 선언이 누락되어 있고, 외부 파일 watcher가 절대경로 문자열을 glob 패턴으로 잘못 사용하고 있다.

---

## What Will Change

### 1. `extension.ts` — 활성화 흐름 재설계

**현재 문제:**

```typescript
const provider = new MerryScriptsProvider(workspaceRoot); // constructor 안에서 비동기 reload()
window.registerTreeDataProvider("merryScripts", provider); // 이 시점에 nodes = []
provider.refresh(); // 또 reload() 호출
```

**수정 방향:**

- `MerryScriptsProvider` 생성자에서 `reload()` 제거
- `activate()`에서 `await provider.load()` 호출 후 provider 등록
- CLI 감지(`detectMerryCli`)를 비동기로 분리해 TreeView 표시를 블로킹하지 않음
- `window.registerTreeDataProvider` → `window.createTreeView`로 전환 (view 가시성 제어 가능)
- CodeLens Provider 등록 추가

```typescript
export async function activate(context: ExtensionContext) {
  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders?.length) return;

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // 1. Provider 생성 후 초기 로딩 완료 대기
  const provider = new MerryScriptsProvider(workspaceRoot);
  await provider.load(); // nodes 채워짐

  // 2. TreeView 등록 (이미 데이터가 있음)
  const treeView = window.createTreeView("merryScripts", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // 3. CodeLens Provider 등록
  const codeLensProvider = new MerryCodeLensProvider(provider);
  const docSelector = [
    { language: "yaml", pattern: "**/pubspec.yaml" },
    { language: "yaml", pattern: "**/merry.yaml" },
    { language: "yaml", pattern: "**/derry.yaml" },
  ];
  context.subscriptions.push(
    treeView,
    provider,
    languages.registerCodeLensProvider(docSelector, codeLensProvider),
  );

  // 4. CLI 감지는 백그라운드로 (TreeView를 블로킹하지 않음)
  detectMerryCli().then((info) => { ... });

  // 5. 커맨드 등록...
}
```

### 2. `merry-scripts-provider.ts` — 초기화 패턴 변경

- 생성자: watcher만 설정, `reload()` 호출 안 함
- `load(): Promise<void>` 메서드 추가 — `activate()`에서 await할 초기 로딩 진입점
- 외부 파일 watcher: `createFileSystemWatcher(string)` → `createFileSystemWatcher(RelativePattern)` 변경

  ```typescript
  // Before (잘못된 절대경로 string):
  workspace.createFileSystemWatcher(result.scriptsFilePath);

  // After (RelativePattern):
  const dir = path.dirname(result.scriptsFilePath);
  const base = path.basename(result.scriptsFilePath);
  workspace.createFileSystemWatcher(new RelativePattern(dir, base));
  ```

- `reload()` 완료 시 CodeLens도 갱신하도록 이벤트 추가

### 3. `src/merry-codelens-provider.ts` (신규)

`vscode.CodeLensProvider`를 구현하는 새 파일.

- `provideCodeLenses(document)`:
  - 현재 열린 파일이 pubspec.yaml이면 → `provider.getScriptsFilePath()`와 비교해 스크립트 소스 파일인지 확인
  - 스크립트 소스 파일이면 → `provider`의 노드 목록을 순회하며 YAML 내 각 키의 줄 번호를 찾아 CodeLens 생성
  - 각 CodeLens: 제목 `▷ Run: <scriptName>`, 커맨드 `vscode-merry.runScript`

```typescript
export class MerryCodeLensProvider implements CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly provider: MerryScriptsProvider) {
    // provider의 onDidChangeTreeData 구독 → CodeLens도 갱신
    provider.onDidChangeTreeData(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    const scriptsFilePath = this.provider.getScriptsFilePath();
    if (!scriptsFilePath || document.uri.fsPath !== scriptsFilePath) return [];

    const nodes = this.provider.getNodes(); // 새로 노출할 메서드
    return this.buildLenses(document, nodes);
  }
}
```

줄 번호 탐색: `document.getText()` 줄별 순회 → `/^(\s*)(key):` 패턴으로 YAML 키 위치 매핑.

### 4. `package.json` — 누락된 선언 추가

- `vscode-merry.installCli` 커맨드를 `contributes.commands`에 추가
- 뷰 `when` 절 단순화: `workspaceContains:pubspec.yaml` 하나로 충분 (활성화 조건과 일치)
- `contributes.menus`에 `installCli` 항목 추가 (status bar 클릭 또는 팔레트)

### 5. `merry-scripts-provider.ts` — `getNodes()` 노출

CodeLens Provider에서 현재 파싱된 노드를 읽을 수 있도록 `getNodes(): ScriptNode[]` 메서드 추가.

---

## Files to Modify

| File                             | Action                                                |
| -------------------------------- | ----------------------------------------------------- |
| `src/extension.ts`               | 활성화 흐름 재설계, CodeLens 등록 추가                |
| `src/merry-scripts-provider.ts`  | `load()` 메서드 추가, watcher 수정, `getNodes()` 노출 |
| `src/merry-codelens-provider.ts` | **신규** — CodeLens 구현                              |
| `package.json`                   | `installCli` 커맨드 선언, 뷰 when 절 단순화           |

---

## Verification

1. `pnpm run compile` — 타입 에러 없이 빌드
2. F5로 Extension Development Host 실행 (test-workspace 열림)
3. 사이드바 Explorer 패널 → **Merry Scripts** 섹션에 스크립트 목록이 즉시 표시됨
4. `test-workspace/merry.yaml` 열기 → 각 스크립트 키 위에 `▷ Run: <name>` CodeLens 버튼 표시됨
5. CodeLens 클릭 → 터미널에서 `merry run <script>` 실행
6. `pnpm run test` — 기존 테스트 통과 확인
