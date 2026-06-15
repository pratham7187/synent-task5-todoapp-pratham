/* ============================================================
   Taskly — To-Do App  |  script.js
   Features:
     • Add / Edit / Delete / Complete tasks
     • Priority labels (High / Medium / Low)
     • Filter: All / Pending / Completed
     • Search tasks (live)
     • Task counter + progress bar
     • Clear All (with confirmation modal)
     • localStorage persistence
     • Light / Dark mode (persisted)
     • Live date / time display
     • Toast notifications
     • Keyboard: Enter to add, Escape to cancel edit
   ============================================================ */

// ── DOM references ────────────────────────────────────────────
const taskInput      = document.getElementById('taskInput');
const addBtn         = document.getElementById('addBtn');
const taskList       = document.getElementById('taskList');
const emptyState     = document.getElementById('emptyState');
const emptyTitle     = document.getElementById('emptyTitle');
const emptySub       = document.getElementById('emptySub');
const searchInput    = document.getElementById('searchInput');
const filterTabs     = document.querySelectorAll('.filter-tab');
const clearAllBtn    = document.getElementById('clearAllBtn');
const statTotal      = document.getElementById('statTotal');
const statDone       = document.getElementById('statDone');
const statPending    = document.getElementById('statPending');
const progressFill   = document.getElementById('progressFill');
const progressPct    = document.getElementById('progressPct');
const themeToggle    = document.getElementById('themeToggle');
const currentDate    = document.getElementById('currentDate');
const currentTime    = document.getElementById('currentTime');
const inputHint      = document.getElementById('inputHint');
const modalBackdrop  = document.getElementById('modalBackdrop');
const modalCancel    = document.getElementById('modalCancel');
const modalConfirm   = document.getElementById('modalConfirm');
const modalCount     = document.getElementById('modalCount');
const toast          = document.getElementById('toast');

// ── State ─────────────────────────────────────────────────────
let tasks       = [];          // array of task objects
let activeFilter = 'all';      // 'all' | 'pending' | 'completed'
let searchQuery  = '';         // live search string
let toastTimer   = null;       // debounce handle for toast
let editingId    = null;       // id of task currently being edited

// ── Task schema ───────────────────────────────────────────────
// { id, text, completed, priority, createdAt }

// ── Helpers ───────────────────────────────────────────────────

/** Generate a simple unique ID */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Persist tasks to localStorage */
const saveTasks = () => localStorage.setItem('taskly_tasks', JSON.stringify(tasks));

/** Load tasks from localStorage */
const loadTasks = () => {
  try {
    const raw = localStorage.getItem('taskly_tasks');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

/** Format a timestamp to a short relative or absolute label */
const formatDate = (ts) => {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Get the selected priority from the radio group */
const getSelectedPriority = () => {
  const checked = document.querySelector('input[name="priority"]:checked');
  return checked ? checked.value : 'medium';
};

// ── Toast notification ────────────────────────────────────────
/**
 * Show a toast message.
 * @param {string} msg   - Message text
 * @param {'green'|'red'|''} type - Colour variant
 * @param {number} duration - ms before auto-dismiss
 */
const showToast = (msg, type = '', duration = 2600) => {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className   = `toast show${type ? ' toast-' + type : ''}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, duration);
};

// ── Date / time clock ─────────────────────────────────────────
const updateClock = () => {
  const now = new Date();
  currentDate.textContent = now.toLocaleDateString(undefined, {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'
  });
  currentTime.textContent = now.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

// ── Light / Dark mode ─────────────────────────────────────────
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('taskly_theme', theme);
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

// ── Stats + progress bar ──────────────────────────────────────
const updateStats = () => {
  const total     = tasks.length;
  const done      = tasks.filter(t => t.completed).length;
  const pending   = total - done;
  const pct       = total ? Math.round((done / total) * 100) : 0;

  statTotal.textContent   = total;
  statDone.textContent    = done;
  statPending.textContent = pending;
  progressFill.style.width = pct + '%';
  progressPct.textContent  = pct + '%';
};

// ── Filter + search logic ─────────────────────────────────────

/** Returns the subset of tasks that match the active filter + search */
const getFilteredTasks = () => {
  const q = searchQuery.toLowerCase().trim();
  return tasks.filter(t => {
    const matchFilter =
      activeFilter === 'all'       ? true :
      activeFilter === 'completed' ? t.completed :
      /* pending */                  !t.completed;
    const matchSearch = q ? t.text.toLowerCase().includes(q) : true;
    return matchFilter && matchSearch;
  });
};

// ── Render ────────────────────────────────────────────────────

/** Priority badge HTML */
const priorityBadge = (p) => {
  const labels = { high: '↑ High', medium: '● Medium', low: '↓ Low' };
  return `<span class="task-priority-badge badge-${p}">${labels[p] || p}</span>`;
};

/** Build a single task <li> element */
const createTaskElement = (task) => {
  const li = document.createElement('li');
  li.className   = `task-item${task.completed ? ' completed' : ''}`;
  li.dataset.id  = task.id;
  li.dataset.priority = task.priority;

  li.innerHTML = `
    <!-- Checkbox -->
    <div class="task-checkbox-wrap">
      <input
        type="checkbox"
        class="task-checkbox"
        ${task.completed ? 'checked' : ''}
        aria-label="Mark '${task.text}' as ${task.completed ? 'pending' : 'done'}"
        data-action="toggle"
      />
    </div>

    <!-- Body -->
    <div class="task-body">
      <span class="task-text">${escapeHtml(task.text)}</span>
      <div class="task-meta">
        ${priorityBadge(task.priority)}
        <span class="task-date">${formatDate(task.createdAt)}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="task-actions">
      <button class="task-btn btn-edit"   data-action="edit"   aria-label="Edit task" title="Edit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="task-btn btn-delete" data-action="delete" aria-label="Delete task" title="Delete">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  `;

  return li;
};

/** Safely escape HTML to prevent XSS */
const escapeHtml = (str) =>
  str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
     .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/** Main render function — diffs list by removing & re-rendering filtered tasks */
const render = () => {
  const filtered = getFilteredTasks();
  updateStats();

  // Clear current list
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.hidden = false;
    // Contextual empty state messaging
    if (tasks.length === 0) {
      emptyTitle.textContent = 'No tasks yet';
      emptySub.textContent   = 'Add something above and get moving.';
    } else if (searchQuery) {
      emptyTitle.textContent = 'No matches found';
      emptySub.textContent   = `Nothing matches "${searchQuery}". Try a different keyword.`;
    } else {
      emptyTitle.textContent = activeFilter === 'completed' ? 'Nothing completed yet' : 'All caught up!';
      emptySub.textContent   = activeFilter === 'completed'
        ? 'Finish a task to see it here.'
        : 'No pending tasks. Add one or switch filters.';
    }
  } else {
    emptyState.hidden = true;
    filtered.forEach(task => taskList.appendChild(createTaskElement(task)));
  }
};

// ── Add task ──────────────────────────────────────────────────
const addTask = () => {
  const text = taskInput.value.trim();

  if (!text) {
    // Visual feedback: shake + hint
    taskInput.classList.add('shake');
    inputHint.textContent = 'Task description can\'t be empty.';
    setTimeout(() => {
      taskInput.classList.remove('shake');
      inputHint.textContent = '';
    }, 1200);
    taskInput.focus();
    return;
  }

  const task = {
    id:        uid(),
    text,
    completed: false,
    priority:  getSelectedPriority(),
    createdAt: Date.now(),
  };

  tasks.unshift(task); // newest first
  saveTasks();
  render();

  taskInput.value = '';
  inputHint.textContent = '';
  taskInput.focus();
  showToast('Task added', 'green');
};

// ── Toggle complete ───────────────────────────────────────────
const toggleTask = (id) => {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
  showToast(task.completed ? '✓ Marked as done' : 'Moved back to pending');
};

// ── Delete task ───────────────────────────────────────────────
const deleteTask = (id) => {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) {
    // Animate out first
    li.classList.add('removing');
    li.addEventListener('animationend', () => {
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      render();
    }, { once: true });
  } else {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }
  showToast('Task deleted', 'red');
};

// ── Edit task (inline) ────────────────────────────────────────
const startEdit = (id) => {
  // Cancel any previous edit first
  if (editingId && editingId !== id) cancelEdit();

  editingId = id;
  const li       = taskList.querySelector(`[data-id="${id}"]`);
  const task     = tasks.find(t => t.id === id);
  if (!li || !task) return;

  const bodyEl   = li.querySelector('.task-body');
  const textEl   = li.querySelector('.task-text');
  const editBtn  = li.querySelector('.btn-edit');

  // Replace text span with input
  const input = document.createElement('input');
  input.type      = 'text';
  input.className = 'task-edit-input';
  input.value     = task.text;
  input.maxLength = 200;
  input.setAttribute('aria-label', 'Edit task text');

  textEl.replaceWith(input);
  input.focus();
  input.select();

  // Swap edit → save icon
  editBtn.dataset.action = 'save';
  editBtn.setAttribute('aria-label', 'Save changes');
  editBtn.classList.replace('btn-edit', 'btn-save');
  editBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;

  // Escape to cancel
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit(id, input.value); }
    if (e.key === 'Escape') { cancelEdit(); }
  });
};

const saveEdit = (id, newText) => {
  const trimmed = newText.trim();
  if (!trimmed) { showToast('Task text can\'t be empty', 'red'); return; }
  const task = tasks.find(t => t.id === id);
  if (task) { task.text = trimmed; saveTasks(); }
  editingId = null;
  render();
  showToast('Task updated');
};

const cancelEdit = () => {
  editingId = null;
  render();
};

// ── Clear all ─────────────────────────────────────────────────
const openClearModal = () => {
  if (tasks.length === 0) { showToast('No tasks to clear'); return; }
  modalCount.textContent = tasks.length;
  modalBackdrop.hidden   = false;
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalConfirm.focus();
};

const closeClearModal = () => {
  modalBackdrop.hidden = true;
  modalBackdrop.setAttribute('aria-hidden', 'true');
  clearAllBtn.focus();
};

const clearAll = () => {
  const count = tasks.length;
  tasks = [];
  saveTasks();
  render();
  closeClearModal();
  showToast(`Cleared ${count} task${count !== 1 ? 's' : ''}`, 'red');
};

// ── Event delegation on task list ────────────────────────────
taskList.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const li = actionEl.closest('.task-item');
  if (!li) return;
  const id = li.dataset.id;

  switch (actionEl.dataset.action) {
    case 'toggle': toggleTask(id); break;
    case 'edit':   startEdit(id);  break;
    case 'save': {
      const input = li.querySelector('.task-edit-input');
      if (input) saveEdit(id, input.value);
      break;
    }
    case 'delete': deleteTask(id); break;
  }
});

// Also catch checkbox change (in case click bubbling misses it)
taskList.addEventListener('change', (e) => {
  if (e.target.classList.contains('task-checkbox')) {
    const li = e.target.closest('.task-item');
    if (li) toggleTask(li.dataset.id);
  }
});

// ── Add button & Enter key ────────────────────────────────────
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTask(); }
});

// ── Filter tabs ───────────────────────────────────────────────
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeFilter = tab.dataset.filter;
    render();
  });
});

// ── Search ────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  render();
});

// ── Clear all ─────────────────────────────────────────────────
clearAllBtn.addEventListener('click', openClearModal);
modalCancel.addEventListener('click',  closeClearModal);
modalConfirm.addEventListener('click', clearAll);

// Close modal on backdrop click
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeClearModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalBackdrop.hidden) closeClearModal();
});

// ── Theme toggle ──────────────────────────────────────────────
themeToggle.addEventListener('click', toggleTheme);

// ── Init ──────────────────────────────────────────────────────
const init = () => {
  // Restore theme
  const savedTheme = localStorage.getItem('taskly_theme') || 'light';
  applyTheme(savedTheme);

  // Load tasks
  tasks = loadTasks();

  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Initial render
  render();
};

init();
