/* タスク管理アプリ - 依存なしのバニラJS実装 */
(function () {
  'use strict';

  var STORAGE_KEY = 'task-manager.tasks.v1';
  var PRIORITIES = ['high', 'medium', 'low'];
  var PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };
  var PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  var FILTERS = ['all', 'active', 'completed'];
  var SORTS = ['created', 'due', 'priority'];
  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  var el = {
    form: document.getElementById('add-form'),
    title: document.querySelector('[data-testid="task-input"]'),
    due: document.querySelector('[data-testid="due-input"]'),
    priority: document.querySelector('[data-testid="priority-select"]'),
    error: document.getElementById('form-error'),
    list: document.querySelector('[data-testid="task-list"]'),
    empty: document.getElementById('empty-state'),
    remaining: document.querySelector('[data-testid="remaining-count"]'),
    sort: document.querySelector('[data-testid="sort-select"]'),
    clear: document.querySelector('[data-testid="clear-completed"]'),
    filters: Array.prototype.slice.call(document.querySelectorAll('.filters .chip')),
    template: document.getElementById('task-template')
  };

  var state = {
    tasks: load(),
    filter: 'all',
    sort: 'created',
    editingId: null
  };

  /* ---- 永続化 -------------------------------------------------------- */

  // localStorage が使えない環境 (無効化・プライベートモード等) でも
  // 例外でアプリが止まらないよう、読み書きは常に try/catch で包む。
  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter(Boolean);
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    } catch (e) {
      /* 保存できなくても操作は継続する */
    }
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
      title: title,
      done: raw.done === true,
      due: typeof raw.due === 'string' && DATE_PATTERN.test(raw.due) ? raw.due : null,
      priority: PRIORITIES.indexOf(raw.priority) !== -1 ? raw.priority : 'medium'
    };
  }

  function createId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ---- 絞り込み・並べ替え -------------------------------------------- */

  function visibleTasks() {
    var filtered = state.tasks.filter(function (task) {
      if (state.filter === 'active') return !task.done;
      if (state.filter === 'completed') return task.done;
      return true;
    });

    // 元の配列順 = 作成順。比較が同値のときの安定した基準にも使う。
    var order = new Map();
    state.tasks.forEach(function (task, index) { order.set(task.id, index); });

    var sorted = filtered.slice();
    if (state.sort === 'due') {
      sorted.sort(function (a, b) {
        if (a.due !== b.due) {
          if (!a.due) return 1;   // 期限なしは末尾
          if (!b.due) return -1;
          return a.due < b.due ? -1 : 1;
        }
        return order.get(a.id) - order.get(b.id);
      });
    } else if (state.sort === 'priority') {
      sorted.sort(function (a, b) {
        var diff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        return diff !== 0 ? diff : order.get(a.id) - order.get(b.id);
      });
    } else {
      sorted.sort(function (a, b) { return order.get(a.id) - order.get(b.id); });
    }
    return sorted;
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function indexOfTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return i;
    }
    return -1;
  }

  /* ---- 描画 ---------------------------------------------------------- */

  function render() {
    var focusHint = captureFocus();
    var tasks = visibleTasks();

    var frag = document.createDocumentFragment();
    tasks.forEach(function (task) { frag.appendChild(createRow(task)); });
    el.list.replaceChildren(frag);

    el.empty.hidden = tasks.length > 0;

    var remaining = state.tasks.filter(function (task) { return !task.done; }).length;
    el.remaining.textContent = String(remaining);

    el.filters.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
    });

    restoreFocus(focusHint);
  }

  function createRow(task) {
    var row = el.template.content.firstElementChild.cloneNode(true);
    row.dataset.id = task.id;
    row.dataset.priority = task.priority;
    row.classList.toggle('done', task.done);

    var toggle = row.querySelector('[data-testid="toggle"]');
    toggle.checked = task.done;
    toggle.setAttribute('aria-label', '「' + task.title + '」を完了にする');

    var badge = row.querySelector('.badge');
    badge.textContent = PRIORITY_LABEL[task.priority];
    badge.setAttribute('aria-label', '優先度: ' + PRIORITY_LABEL[task.priority]);

    var due = row.querySelector('.due');
    due.textContent = task.due ? '期限 ' + task.due : '期限なし';

    var editButton = row.querySelector('[data-testid="edit"]');
    var deleteButton = row.querySelector('[data-testid="delete"]');
    deleteButton.setAttribute('aria-label', '「' + task.title + '」を削除');

    var titleEl = row.querySelector('[data-testid="task-title"]');
    if (state.editingId === task.id) {
      row.classList.add('editing');
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'edit-input';
      input.value = task.title;
      input.dataset.testid = 'edit-input';
      input.setAttribute('aria-label', 'タイトルを編集');
      input.autocomplete = 'off';
      titleEl.replaceWith(input);
      editButton.textContent = '保存';
      editButton.setAttribute('aria-label', '「' + task.title + '」の編集を保存');
    } else {
      titleEl.textContent = task.title;
      editButton.setAttribute('aria-label', '「' + task.title + '」を編集');
    }
    return row;
  }

  // 一覧はまるごと作り直すので、キーボード操作の位置を失わないよう
  // 描画の前後でフォーカス位置を復元する。
  function captureFocus() {
    var active = document.activeElement;
    if (!active || !el.list.contains(active)) return null;
    var row = active.closest('.task-item');
    if (!row || !active.dataset.testid) return null;
    return { id: row.dataset.id, testid: active.dataset.testid };
  }

  function restoreFocus(hint) {
    if (state.editingId) {
      var input = el.list.querySelector('.task-item[data-id="' + state.editingId + '"] .edit-input');
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }
    if (!hint) return;
    var row = el.list.querySelector('.task-item[data-id="' + hint.id + '"]');
    var target = row && row.querySelector('[data-testid="' + hint.testid + '"]');
    if (target) target.focus();
  }

  function showError(message) {
    el.error.textContent = message;
    el.title.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  /* ---- 操作 ---------------------------------------------------------- */

  function addTask() {
    var title = el.title.value.trim();
    if (!title) {                       // F1: 空白のみのタイトルは追加しない
      showError('タイトルを入力してください。');
      el.title.focus();
      return;
    }
    var due = el.due.value;
    state.tasks.push({
      id: createId(),
      title: title,
      done: false,
      due: DATE_PATTERN.test(due) ? due : null,
      priority: PRIORITIES.indexOf(el.priority.value) !== -1 ? el.priority.value : 'medium'
    });
    showError('');
    el.title.value = '';
    el.due.value = '';
    el.priority.value = 'medium';
    save();
    render();
    el.title.focus();
  }

  function startEdit(id) {
    state.editingId = id;
    render();
  }

  // refocus: 省略時は編集ボタンへ戻す / false は触らない /
  //          {id, testid} はその要素へ戻す (タブ移動先を尊重するため)
  function commitEdit(refocus) {
    var id = state.editingId;
    if (!id) return;
    var input = el.list.querySelector('.edit-input');
    var task = findTask(id);
    if (input && task) {
      var title = input.value.trim();
      if (title) task.title = title;    // 空欄で確定した場合は元のタイトルを残す
      save();
    }
    state.editingId = null;
    render();
    if (refocus === false) return;
    if (refocus) focusRow(refocus.id, refocus.testid);
    else focusRow(id, 'edit');
  }

  function cancelEdit() {
    var id = state.editingId;
    if (!id) return;
    state.editingId = null;
    render();
    focusRow(id, 'edit');
  }

  function focusRow(id, testid) {
    var row = el.list.querySelector('.task-item[data-id="' + id + '"]');
    var target = row && row.querySelector('[data-testid="' + testid + '"]');
    if (target) target.focus();
  }

  function removeTask(id) {
    var index = indexOfTask(id);
    if (index === -1) return;
    if (state.editingId === id) state.editingId = null;
    state.tasks.splice(index, 1);
    save();
    render();

    // 削除後にフォーカスが body へ飛ばないようにする。
    var rows = el.list.querySelectorAll('.task-item');
    if (rows.length) {
      var next = rows[Math.min(index, rows.length - 1)];
      next.querySelector('[data-testid="delete"]').focus();
    } else {
      el.title.focus();
    }
  }

  /* ---- イベント ------------------------------------------------------ */

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    addTask();
  });

  el.title.addEventListener('input', function () {
    if (el.error.textContent) showError('');
  });

  el.filters.forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.dataset.filter;
      if (FILTERS.indexOf(value) === -1) return;
      state.filter = value;
      render();
    });
  });

  el.sort.addEventListener('change', function () {
    state.sort = SORTS.indexOf(el.sort.value) !== -1 ? el.sort.value : 'created';
    render();
  });

  el.clear.addEventListener('click', function () {
    var completed = state.tasks.filter(function (task) { return task.done; });
    if (!completed.length) return;
    if (state.editingId && completed.some(function (t) { return t.id === state.editingId; })) {
      state.editingId = null;
    }
    state.tasks = state.tasks.filter(function (task) { return !task.done; });
    save();
    render();
  });

  // 編集中に「保存」ボタンを押したとき、mousedown による blur で
  // 先に確定して再描画されるのを防ぐ (クリックで確実に確定させる)。
  el.list.addEventListener('mousedown', function (event) {
    if (state.editingId && event.target.closest('[data-testid="edit"]')) {
      event.preventDefault();
    }
  });

  el.list.addEventListener('click', function (event) {
    var row = event.target.closest('.task-item');
    if (!row) return;
    var id = row.dataset.id;
    if (event.target.closest('[data-testid="delete"]')) {
      removeTask(id);
    } else if (event.target.closest('[data-testid="edit"]')) {
      if (state.editingId === id) commitEdit();
      else startEdit(id);
    }
  });

  el.list.addEventListener('change', function (event) {
    var toggle = event.target.closest('[data-testid="toggle"]');
    if (!toggle) return;
    var row = toggle.closest('.task-item');
    var task = row && findTask(row.dataset.id);
    if (!task) return;
    var position = Array.prototype.indexOf.call(el.list.children, row);
    task.done = toggle.checked;
    save();
    render();
    // 絞り込み中は行が消えることがあるので、近い位置へフォーカスを移す。
    if (document.activeElement === document.body && el.list.children.length) {
      var rows = el.list.children;
      var next = rows[Math.min(position, rows.length - 1)].querySelector('[data-testid="toggle"]');
      if (next) next.focus();
    }
  });

  el.list.addEventListener('keydown', function (event) {
    if (!event.target.classList.contains('edit-input')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  // フォーカスが編集欄から外れたら確定する。
  // タブ移動で一覧内の別要素へ移った場合は、その要素へフォーカスを戻す。
  el.list.addEventListener('focusout', function (event) {
    if (!state.editingId) return;
    if (!event.target.classList.contains('edit-input')) return;
    var next = event.relatedTarget;
    var hint = false;
    if (next && el.list.contains(next) && next.dataset.testid) {
      var nextRow = next.closest('.task-item');
      if (nextRow) hint = { id: nextRow.dataset.id, testid: next.dataset.testid };
    }
    commitEdit(hint);
  });

  render();
})();
