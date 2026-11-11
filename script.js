import { translate } from './localization.js';
import { readData, saveData, localDate, createId, statuses, colors, isDataEvent } from './store.js';

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const initial = readData();
let data = initial.data;
let language = root.lang === 'en' ? 'en' : 'ru';
let view = ['board', 'overview', 'upcoming', 'archive'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'overview';
let projectId = null;
let mobileStatus = 'doing';
let search = '';
let priority = 'all';
let editingTask = null;
let taskStatus = 'todo';
let editingProject = null;
let checklistDraft = [];
let draggingTask = null;
let confirmAction;
let toastTimer;
let languageTimer;
const taskDialog = $('#task-dialog');
const projectDialog = $('#project-dialog');
const taskForm = $('#task-form');
const projectForm = $('#project-form');
const content = $('#view-content');
const dialogs = [...document.querySelectorAll('dialog')];
const languageButtons = [...document.querySelectorAll('[data-language]')];
const localizedElements = [...document.querySelectorAll('[data-i18n]')];
const placeholderElements = [...document.querySelectorAll('[data-placeholder]')];
const labelledElements = [...document.querySelectorAll('[data-label]')];
const navigationButtons = [...document.querySelectorAll('.primary-nav [data-view], .archive-button')];
let dateFormats;
const t = (key) => translate(key, language);
const escape = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    );
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const nameOf = (entity) => (entity?.sampleKey ? t(entity.sampleKey) : (entity?.title ?? entity?.text ?? ''));
const descriptionOf = (task) => (task.descriptionKey ? t(task.descriptionKey) : task.description);
const projectOf = (task) => data.projects.find((project) => project.id === task.projectId);
const activeTasks = () => data.tasks.filter((task) => !task.archived);
const isOverdue = (task) => !task.archived && task.status !== 'done' && task.due && task.due < localDate();
const locale = () => (language === 'en' ? 'en-GB' : 'ru-RU');

function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('is-visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 3800);
}
function commit(change, message, refresh = true) {
    const stored = readData();
    const next = structuredClone(stored.error ? data : stored.data);
    if (change(next) === false) return false;
    try {
        saveData(next);
    } catch {
        notify(t('storageError'));
        return false;
    }
    data = next;
    if (refresh) render();
    if (message) notify(t(message));
    return true;
}
function dateLabel(value) {
    if (!value) return t('noDate');
    if (value === localDate()) return t('today');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (value === localDate(tomorrow)) return t('tomorrow');
    return dateFormats.short.format(new Date(value + 'T12:00:00'));
}
function compareDueDates(a, b) {
    return (
        (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') ||
        (a.createdAt || 0) - (b.createdAt || 0) ||
        a.id.localeCompare(b.id)
    );
}
function statusLabel(task) {
    if (task.status !== 'doing' || !task.checklist.length) return t(task.status);
    return `${t('doing')} ${task.checklist.filter((item) => item.done).length}/${task.checklist.length}`;
}
function filteredTasks() {
    const query = search.trim().toLocaleLowerCase(locale());
    return data.tasks
        .filter(
            (task) =>
                (view === 'archive' ? task.archived : !task.archived) &&
                (!projectId || task.projectId === projectId) &&
                (priority === 'all' || task.priority === priority) &&
                (!query ||
                    `${nameOf(task)} ${descriptionOf(task)} ${projectOf(task).name}`
                        .toLocaleLowerCase(locale())
                        .includes(query))
        )
        .sort(compareDueDates);
}
function upcomingTasks(tasks = activeTasks()) {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    return tasks
        .filter((task) => !task.archived && task.status !== 'done' && task.due && task.due <= localDate(end))
        .sort(compareDueDates);
}
function projectTag(task) {
    const project = projectOf(task);
    return `<span class="project-tag" data-color="${project.color}"><span class="project-dot"></span><span>${escape(project.name)}</span></span>`;
}
function empty(title, hint, action = '') {
    return `<div class="empty-state"><p>${t(title)}</p><p>${t(hint)}</p>${action}</div>`;
}
function taskCard(task) {
    const project = projectOf(task);
    const completed = task.checklist.filter((item) => item.done).length;
    const progress = task.checklist.length ? (completed / task.checklist.length) * 100 : 0;
    return `<article class="task-card" data-task="${escape(task.id)}" data-color="${project.color}" draggable="true">
        <div class="card-top">${projectTag(task)}<span class="priority-tag" data-priority="${task.priority}">${t(task.priority)}</span></div>
        <h3><button class="task-open" type="button" data-edit-task="${escape(task.id)}">${escape(nameOf(task))}</button></h3>
        ${descriptionOf(task) ? `<p class="task-description">${escape(descriptionOf(task))}</p>` : ''}
        ${task.checklist.length ? `<div class="card-checklist">${task.checklist.map((item) => `<label><input type="checkbox" data-card-check="${escape(item.id)}" ${item.done ? 'checked' : ''}><span>${escape(nameOf(item))}</span></label>`).join('')}</div>` : ''}
        <div class="task-meta"><span class="due-label ${isOverdue(task) ? 'is-overdue' : ''}">${icon('calendar')}${dateLabel(task.due)}</span><span class="task-tools"><button class="icon-button" type="button" data-edit-task="${escape(task.id)}" aria-label="${t('editTask')}" title="${t('editTask')}">${icon('edit')}</button><button class="icon-button" type="button" data-delete-card="${escape(task.id)}" aria-label="${t('delete')}" title="${t('delete')}">${icon('trash')}</button></span></div>
        <div class="card-actions">${
            task.archived
                ? `<button class="text-button" type="button" data-restore-task="${escape(task.id)}">${t('restoreTask')}</button>`
                : `<span class="task-status" data-status="${task.status}">${statusLabel(task)}</span><button class="button secondary task-next" type="button" data-advance-task="${escape(task.id)}">${t(task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'archiveAction')}${icon(task.status === 'done' ? 'archive' : 'arrow')}</button>`
        }</div>
        ${task.status === 'doing' && task.checklist.length && !task.archived ? `<div class="mini-progress task-progress" style="--progress:${progress}%"><span></span></div>` : ''}
    </article>`;
}
function renderBoard() {
    const tasks = filteredTasks();
    $('#mobile-status').innerHTML = statuses
        .map(
            (status) =>
                `<button type="button" data-mobile-status="${status}" aria-pressed="${status === mobileStatus}">${t(status)}<span>${tasks.filter((task) => task.status === status).length}</span></button>`
        )
        .join('');
    return `<div class="board">${statuses
        .map((status) => {
            const list = tasks.filter((task) => task.status === status);
            return `<section class="lane ${mobileStatus === status ? 'is-mobile-active' : ''}" data-status="${status}" aria-label="${t(status)}"><div class="lane-heading"><span class="status-dot"></span><h2>${t(status)}</h2><span class="lane-count">${list.length}</span><button class="icon-button" type="button" data-add-status="${status}" aria-label="${t('newTask')}: ${t(status)}">${icon('plus')}</button></div>${list.map(taskCard).join('') || empty(search || priority !== 'all' ? 'noResults' : 'emptyLane', search || priority !== 'all' ? 'noResultsHint' : 'emptyHint')}</section>`;
        })
        .join('')}</div>`;
}
function urgency(task) {
    if (isOverdue(task)) return 'overdue';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return task.due === localDate() || task.due === localDate(tomorrow) ? 'soon' : 'normal';
}
function agenda(tasks) {
    return `<div class="agenda">${tasks
        .map((task) => {
            const due = new Date(task.due + 'T12:00:00');
            const hasProgress = task.status === 'doing' && task.checklist.length > 0;
            const progress = hasProgress
                ? (task.checklist.filter((item) => item.done).length / task.checklist.length) * 100
                : 0;
            return `<button class="agenda-row ${hasProgress ? 'has-progress' : ''}" type="button" data-go-task="${escape(task.id)}" data-urgency="${urgency(task)}" data-color="${projectOf(task).color}">
            <time class="agenda-date" datetime="${task.due}" aria-label="${dateLabel(task.due)}"><strong>${due.getDate()}</strong><span>${dateFormats.month.format(due)}</span></time>
            <span class="agenda-body"><span class="agenda-title-row"><span class="agenda-title">${escape(nameOf(task))}</span><span class="agenda-status">${statusLabel(task)}</span></span>${projectTag(task)}</span>
            <span class="agenda-arrow">${icon('arrow')}</span>
            ${hasProgress ? `<span class="mini-progress agenda-progress" style="--progress:${progress}%"><span></span></span>` : ''}
        </button>`;
        })
        .join('')}</div>`;
}
function showTask(id) {
    const task = data.tasks.find((task) => task.id === id && !task.archived);
    if (!task) {
        notify(t('staleTask'));
        return;
    }
    mobileStatus = task.status;
    navigate('board', task.projectId);
    const card = [...content.querySelectorAll('[data-task]')].find((card) => card.dataset.task === id);
    card?.classList.add('is-highlighted');
    card?.querySelector('.task-open').focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}
function renderOverview(tasks, projectCounts) {
    const done = tasks.filter((task) => task.status === 'done').length;
    const upcoming = upcomingTasks(tasks).slice(0, 3);
    return `<div class="stats-grid">${[
        ['activeTasks', tasks.length - done],
        ['overdue', tasks.filter(isOverdue).length],
        ['completed', done]
    ]
        .map(
            ([label, count]) =>
                `<div class="stat"><p>${t(label)}</p><strong class="${label === 'overdue' && count > 0 ? 'is-overdue' : ''}">${count.toString().padStart(2, '0')}</strong></div>`
        )
        .join(
            ''
        )}</div><div class="overview-grid"><section><div class="section-heading"><h2>${t('projectProgress')}</h2><button class="icon-button" type="button" data-new-project aria-label="${t('newProject')}">${icon('plus')}</button></div><div class="project-summary-list">${
        data.projects
            .map((project) => {
                const { total, completed } = projectCounts.get(project.id);
                return `<button class="project-progress" type="button" data-project="${escape(project.id)}" data-color="${project.color}"><span class="project-progress-top"><span><span class="project-dot"></span>${escape(project.name)}</span><span>${completed} / ${total}</span></span><span class="mini-progress" style="--progress:${total ? (completed / total) * 100 : 0}%"><span></span></span></button>`;
            })
            .join('') ||
        empty(
            'noProjects',
            'noProjectsHint',
            `<button type="button" class="button primary" data-new-project>${t('newProject')}</button>`
        )
    }</div></section><section><div class="section-heading"><h2>${t('upcoming')}</h2><button class="text-button" type="button" data-view="upcoming">${t('viewAll')} ${icon('arrow')}</button></div>${upcoming.length ? agenda(upcoming) : empty('noUpcoming', 'noUpcomingHint')}</section></div>`;
}
function render(animate = false) {
    content.classList.remove('is-entering');
    const tasks = activeTasks();
    const projectCounts = new Map(
        data.projects.map((project) => [project.id, { total: 0, completed: 0, active: 0 }])
    );
    let openTasks = 0;
    for (const task of tasks) {
        const counts = projectCounts.get(task.projectId);
        counts.total++;
        if (task.status === 'done') counts.completed++;
        else {
            counts.active++;
            openTasks++;
        }
    }
    if (!data.projects.some((project) => project.id === projectId)) projectId = null;
    const selected = data.projects.find((project) => project.id === projectId);
    document.title = `byedeadline — ${selected ? selected.name : t(view)}`;
    $('#current-view').textContent = selected ? selected.name : t(view);
    $('#page-title').textContent = selected ? selected.name : t(view === 'overview' ? 'overviewTitle' : view);
    const description = selected
        ? selected.description
        : t(
              view === 'board'
                  ? 'boardDescription'
                  : view === 'overview'
                    ? 'overviewDescription'
                    : view === 'archive'
                      ? 'archiveDescription'
                      : 'upcomingDescription'
          );
    $('#page-description').textContent = description;
    $('#page-description').hidden = !description;
    $('#page-kicker').textContent = dateFormats.heading.format(new Date());
    $('#nav-count').textContent = openTasks;
    $('#edit-project').hidden = !selected;
    $('#toolbar').hidden = view === 'overview' || !data.projects.length;
    $('#mobile-status').hidden = view !== 'board' || !data.projects.length;
    navigationButtons.forEach((button) => {
        if (button.dataset.view === view && !projectId) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    $('#project-list').innerHTML = data.projects
        .map(
            (project) =>
                `<button type="button" class="project-button" data-project="${escape(project.id)}" data-color="${project.color}" ${project.id === projectId ? 'aria-current="page"' : ''}><span class="project-dot"></span><span class="project-name">${escape(project.name)}</span><span class="nav-count">${projectCounts.get(project.id).active}</span></button>`
        )
        .join('');
    if (view === 'archive') {
        const tasks = filteredTasks();
        content.innerHTML = tasks.length
            ? `<div class="archive-grid">${tasks.map(taskCard).join('')}</div>`
            : empty(
                  search || priority !== 'all' ? 'noResults' : 'emptyArchive',
                  search || priority !== 'all' ? 'noResultsHint' : 'emptyArchiveHint'
              );
    } else if (view === 'overview') {
        content.innerHTML = renderOverview(tasks, projectCounts);
    } else if (!data.projects.length) {
        content.innerHTML = empty(
            'noProjects',
            'noProjectsHint',
            `<button type="button" class="button primary" data-new-project>${t('newProject')}</button>`
        );
    } else if (view === 'board') {
        content.innerHTML = renderBoard();
    } else {
        const tasks = upcomingTasks(filteredTasks());
        content.innerHTML = tasks.length
            ? agenda(tasks)
            : empty(
                  search || priority !== 'all' ? 'noResults' : 'noUpcoming',
                  search || priority !== 'all' ? 'noResultsHint' : 'noUpcomingHint'
              );
    }
    syncProjectScroll();
    if (animate && !reducedMotion.matches) {
        content.classList.remove('is-entering');
        void content.offsetWidth;
        content.classList.add('is-entering');
    }
}
function syncProjectScroll() {
    const list = $('#project-list');
    list.classList.toggle('has-above', list.scrollTop > 1);
    list.classList.toggle('has-below', list.scrollTop + list.clientHeight < list.scrollHeight - 1);
}
$('#project-list').addEventListener('scroll', syncProjectScroll, { passive: true });
new ResizeObserver(syncProjectScroll).observe($('#project-list'));
function navigate(next, selected = null) {
    view = next;
    projectId = selected;
    search = '';
    priority = 'all';
    $('#search').value = '';
    $('#priority-filter').value = 'all';
    history.replaceState(null, '', `#${view}`);
    setSidebar(false);
    render(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.getSelection()?.removeAllRanges();
    $('#main').focus({ preventScroll: true });
}
function translateInterface(animate = false) {
    root.lang = language;
    dateFormats = {
        short: new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }),
        month: new Intl.DateTimeFormat(locale(), { month: 'short' }),
        heading: new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
    };
    localizedElements.forEach((element) => (element.textContent = t(element.dataset.i18n)));
    placeholderElements.forEach((element) => (element.placeholder = t(element.dataset.placeholder)));
    labelledElements.forEach((element) => element.setAttribute('aria-label', t(element.dataset.label)));
    languageButtons.forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.language === language))
    );
    setThemeLabel();
    render();
    clearTimeout(languageTimer);
    root.classList.remove('language-changing');
    if (animate && !reducedMotion.matches) {
        void root.offsetWidth;
        root.classList.add('language-changing');
        languageTimer = setTimeout(() => root.classList.remove('language-changing'), 600);
    }
}
function setThemeLabel() {
    const dark = root.dataset.theme === 'dark';
    $('#theme-icon').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    $('#theme-toggle').setAttribute('aria-label', t(dark ? 'lightTheme' : 'darkTheme'));
    $('#theme-toggle').setAttribute('aria-pressed', String(dark));
    $('meta[name="theme-color"]').content = dark ? '#171b1a' : '#f2f3ed';
}
$('#theme-toggle').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    setThemeLabel();
    try {
        localStorage.setItem('byedeadline-theme', root.dataset.theme);
    } catch {}
});
languageButtons.forEach((button) =>
    button.addEventListener('click', () => {
        if (language === button.dataset.language) return;
        language = button.dataset.language;
        try {
            localStorage.setItem('byedeadline-language', language);
        } catch {}
        translateInterface(true);
    })
);
function setSidebar(open) {
    $('#sidebar').classList.toggle('is-open', open);
    $('#sidebar-scrim').hidden = !open;
    $('#open-sidebar').setAttribute('aria-expanded', String(open));
    if (matchMedia('(max-width: 980px)').matches) {
        $('#sidebar').inert = !open;
        $('.workspace').inert = open;
        syncPageScroll();
    }
    if (open) $('#close-sidebar').focus();
}
$('#open-sidebar').addEventListener('click', () => setSidebar(true));
$('#close-sidebar').addEventListener('click', () => {
    setSidebar(false);
    $('#open-sidebar').focus();
});
$('#sidebar-scrim').addEventListener('click', () => {
    setSidebar(false);
    $('#open-sidebar').focus();
});
const mobileMenu = matchMedia('(max-width: 980px)');
const sidebarResize = $('#sidebar-resize');
let preferredSidebarWidth = 234;
let resizeStart = null;
try {
    const savedWidth = Number(localStorage.getItem('byedeadline-sidebar-width'));
    if (Number.isFinite(savedWidth) && savedWidth >= 200 && savedWidth <= 400)
        preferredSidebarWidth = savedWidth;
} catch {}
function applySidebarWidth() {
    const maximum = Math.max(200, Math.min(400, window.innerWidth - 640));
    const width = Math.max(200, Math.min(maximum, preferredSidebarWidth));
    root.style.setProperty('--sidebar-width', `${width}px`);
    sidebarResize.setAttribute('aria-valuemax', String(maximum));
    sidebarResize.setAttribute('aria-valuenow', String(Math.round(width)));
    return width;
}
function rememberSidebarWidth() {
    try {
        localStorage.setItem('byedeadline-sidebar-width', String(preferredSidebarWidth));
    } catch {}
}
function finishSidebarResize() {
    if (!resizeStart) return;
    const pointerId = resizeStart.pointerId;
    resizeStart = null;
    if (sidebarResize.hasPointerCapture(pointerId)) sidebarResize.releasePointerCapture(pointerId);
    document.body.classList.remove('is-resizing');
    rememberSidebarWidth();
}
sidebarResize.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || mobileMenu.matches) return;
    event.preventDefault();
    resizeStart = { pointerId: event.pointerId, x: event.clientX, width: applySidebarWidth() };
    sidebarResize.setPointerCapture(event.pointerId);
    document.body.classList.add('is-resizing');
});
sidebarResize.addEventListener('pointermove', (event) => {
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) return;
    const maximum = Number(sidebarResize.getAttribute('aria-valuemax'));
    preferredSidebarWidth = Math.max(
        200,
        Math.min(maximum, resizeStart.width + event.clientX - resizeStart.x)
    );
    applySidebarWidth();
});
sidebarResize.addEventListener('pointerup', finishSidebarResize);
sidebarResize.addEventListener('pointercancel', finishSidebarResize);
sidebarResize.addEventListener('lostpointercapture', finishSidebarResize);
sidebarResize.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const maximum = Number(sidebarResize.getAttribute('aria-valuemax'));
    const width = applySidebarWidth();
    const values = { ArrowLeft: width - 10, ArrowRight: width + 10, Home: 200, End: maximum };
    preferredSidebarWidth = Math.max(200, Math.min(maximum, values[event.key]));
    applySidebarWidth();
    rememberSidebarWidth();
});
window.addEventListener('resize', () => {
    finishSidebarResize();
    applySidebarWidth();
});
applySidebarWidth();
function syncSidebar() {
    $('#sidebar').inert = mobileMenu.matches;
    $('.workspace').inert = false;
    $('#sidebar').classList.remove('is-open');
    $('#sidebar-scrim').hidden = true;
    $('#open-sidebar').setAttribute('aria-expanded', 'false');
    syncPageScroll();
}
mobileMenu.addEventListener('change', syncSidebar);
syncSidebar();
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('#sidebar').classList.contains('is-open')) {
        setSidebar(false);
        $('#open-sidebar').focus();
    }
    if (event.key === 'Tab' && $('#sidebar').classList.contains('is-open')) {
        const focusable = [...$('#sidebar').querySelectorAll('a, button')].filter(
            (element) => element.getClientRects().length
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});
function openTask(id = null, status = 'todo') {
    if (!data.projects.length) {
        openProject(null, true);
        return;
    }
    const task = data.tasks.find((task) => task.id === id);
    if (id && !task) {
        notify(t('staleTask'));
        return;
    }
    editingTask = task?.id || null;
    taskForm.reset();
    taskForm.elements.title.setCustomValidity('');
    $('#task-dialog-title').textContent = t(task ? 'editTask' : 'newTask');
    taskForm.elements.projectId.innerHTML = data.projects
        .map((project) => `<option value="${escape(project.id)}">${escape(project.name)}</option>`)
        .join('');
    taskForm.elements.title.value = task ? nameOf(task) : '';
    taskForm.elements.description.value = task ? descriptionOf(task) : '';
    taskForm.elements.projectId.value = task?.projectId || projectId || data.projects[0].id;
    taskStatus = task?.status || status;
    taskForm.elements.priority.value = task?.priority || 'medium';
    taskForm.elements.due.value = task?.due || '';
    checklistDraft = (task?.checklist || []).map((item) => ({
        id: item.id,
        text: nameOf(item),
        done: item.done
    }));
    $('#checklist-input').value = '';
    $('#delete-task').hidden = !task;
    renderChecklist();
    taskDialog.showModal();
    taskForm.elements.title.focus();
}
function renderChecklist() {
    $('#checklist-items').innerHTML = checklistDraft
        .map(
            (item) =>
                `<div class="checklist-row"><label><input type="checkbox" data-check-item="${escape(item.id)}" ${item.done ? 'checked' : ''}><span>${escape(item.text)}</span></label><button class="icon-button" type="button" data-delete-item="${escape(item.id)}" aria-label="${t('deleteItem')}">${icon('close')}</button></div>`
        )
        .join('');
}
function addChecklist() {
    const input = $('#checklist-input');
    const text = input.value.trim();
    if (!text) return;
    checklistDraft.push({ id: createId(), text, done: false });
    input.value = '';
    renderChecklist();
    input.focus();
}
$('#add-checklist').addEventListener('click', addChecklist);
$('#checklist-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addChecklist();
    }
});
$('#checklist-items').addEventListener('change', (event) => {
    const item = checklistDraft.find((item) => item.id === event.target.dataset.checkItem);
    if (item) item.done = event.target.checked;
});
$('#checklist-items').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-item]');
    if (!button) return;
    checklistDraft = checklistDraft.filter((item) => item.id !== button.dataset.deleteItem);
    renderChecklist();
});
taskForm.elements.title.addEventListener('input', () => taskForm.elements.title.setCustomValidity(''));
taskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = taskForm.elements.title.value.trim();
    if (!title) {
        taskForm.elements.title.setCustomValidity(t('required'));
        taskForm.elements.title.reportValidity();
        return;
    }
    const fields = Object.fromEntries(new FormData(taskForm));
    const task = {
        id: editingTask || createId(),
        title,
        description: fields.description.trim(),
        projectId: fields.projectId,
        status: taskStatus,
        priority: fields.priority,
        due: fields.due,
        checklist: structuredClone(checklistDraft),
        createdAt: Date.now()
    };
    const saved = commit(
        (next) => {
            if (!next.projects.some((project) => project.id === task.projectId)) {
                notify(t('staleProject'));
                return false;
            }
            const index = next.tasks.findIndex((item) => item.id === editingTask);
            if (editingTask && index < 0) {
                notify(t('staleTask'));
                return false;
            }
            if (index < 0) next.tasks.push(task);
            else
                next.tasks[index] = {
                    ...task,
                    status: next.tasks[index].status,
                    createdAt: next.tasks[index].createdAt,
                    archived: Boolean(next.tasks[index].archived && next.tasks[index].status === 'done')
                };
        },
        'taskSaved',
        false
    );
    if (saved) {
        taskDialog.close();
        const savedTask = data.tasks.find((item) => item.id === task.id);
        mobileStatus = savedTask.status;
        if (view === 'archive' && !savedTask.archived) navigate('board', task.projectId);
        else render();
    }
});
function openProject(id = null, afterTask = false) {
    if ($('#sidebar').classList.contains('is-open')) setSidebar(false);
    const project = data.projects.find((project) => project.id === id);
    editingProject = project?.id || null;
    projectDialog.dataset.afterTask = String(afterTask);
    projectForm.reset();
    projectForm.elements.name.setCustomValidity('');
    $('#project-dialog-title').textContent = t(project ? 'editProject' : 'newProject');
    projectForm.elements.name.value = project ? project.name : '';
    projectForm.elements.description.value = project?.description || '';
    $('#color-options').innerHTML = colors
        .map(
            (color) =>
                `<label class="color-option" data-color="${color}"><input type="radio" name="color" value="${color}" aria-label="${t(color)}" ${color === (project?.color || colors[0]) ? 'checked' : ''}></label>`
        )
        .join('');
    $('#delete-project').hidden = !project;
    projectDialog.showModal();
    projectForm.elements.name.focus();
}
projectForm.elements.name.addEventListener('input', () => projectForm.elements.name.setCustomValidity(''));
projectForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = projectForm.elements.name.value.trim();
    if (!name) {
        projectForm.elements.name.setCustomValidity(t('required'));
        projectForm.elements.name.reportValidity();
        return;
    }
    const project = {
        id: editingProject || createId(),
        name,
        description: projectForm.elements.description.value.trim(),
        color: projectForm.elements.color.value
    };
    const saved = commit(
        (next) => {
            const index = next.projects.findIndex((item) => item.id === editingProject);
            if (editingProject && index < 0) {
                notify(t('staleProject'));
                return false;
            }
            if (index < 0) next.projects.push(project);
            else next.projects[index] = project;
        },
        'projectSaved',
        false
    );
    if (!saved) return;
    const afterTask = projectDialog.dataset.afterTask === 'true';
    projectDialog.close();
    navigate('board', project.id);
    if (afterTask) openTask();
});
function confirm(title, copy, action) {
    $('#confirm-title').textContent = t(title);
    $('#confirm-copy').textContent = t(copy);
    confirmAction = action;
    $('#confirm-dialog').showModal();
    $('#confirm-action').focus();
}
$('#confirm-dialog').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) $('#confirm-action').click();
});
$('#confirm-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    $('#confirm-dialog').close();
});
$('#confirm-dialog').addEventListener('close', () => {
    confirmAction = null;
});
$('#confirm-action').addEventListener('click', () => {
    const action = confirmAction;
    $('#confirm-dialog').close();
    confirmAction = null;
    action?.();
});
$('#delete-task').addEventListener('click', () =>
    confirm('taskDeleteTitle', 'taskDeleteCopy', () => {
        if (
            commit((next) => {
                next.tasks = next.tasks.filter((task) => task.id !== editingTask);
            }, 'deleted')
        )
            taskDialog.close();
    })
);
$('#delete-project').addEventListener('click', () =>
    confirm('projectDeleteTitle', 'projectDeleteCopy', () => {
        if (
            commit((next) => {
                next.tasks = next.tasks.filter((task) => task.projectId !== editingProject);
                next.projects = next.projects.filter((project) => project.id !== editingProject);
            }, 'deleted')
        ) {
            projectDialog.close();
            navigate('board');
        }
    })
);
function syncPageScroll() {
    document.body.style.overflow =
        dialogs.some((dialog) => dialog.open) || $('#sidebar').classList.contains('is-open') ? 'hidden' : '';
}
const dialogObserver = new MutationObserver(syncPageScroll);
dialogs.forEach((dialog) => {
    let backdropPointer = false;
    dialog.addEventListener('pointerdown', (event) => {
        backdropPointer = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) dialog.close();
        if (event.target !== dialog || !backdropPointer) return;
        backdropPointer = false;
        const bounds = dialog.getBoundingClientRect();
        if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
        )
            dialog.close();
    });
    dialog.addEventListener('close', syncPageScroll);
    dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
});
function moveTask(id, status) {
    if (!statuses.includes(status)) return;
    const keepFocus = document.activeElement?.dataset.advanceTask === id;
    const moved = commit(
        (next) => {
            const task = next.tasks.find((task) => task.id === id);
            if (!task) {
                notify(t('staleTask'));
                return false;
            }
            task.status = status;
            task.archived = false;
        },
        'taskMoved',
        false
    );
    if (moved) {
        mobileStatus = status;
        render();
        if (keepFocus) {
            const nextAction = [...content.querySelectorAll('[data-advance-task]')].find(
                (button) => button.dataset.advanceTask === id
            );
            nextAction?.focus({ preventScroll: true });
        }
    }
}
function archiveTask(id, archived) {
    commit(
        (next) => {
            const task = next.tasks.find((task) => task.id === id);
            if (!task || task.status !== 'done') {
                notify(t('archiveUnavailable'));
                return false;
            }
            task.archived = archived;
        },
        archived ? 'taskArchived' : 'taskRestored'
    );
}
document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.goTask) showTask(button.dataset.goTask);
    else if (button.dataset.advanceTask) {
        const task = data.tasks.find((task) => task.id === button.dataset.advanceTask);
        if (!task) {
            notify(t('staleTask'));
            return;
        }
        if (task.status === 'done') archiveTask(task.id, true);
        else moveTask(task.id, task.status === 'todo' ? 'doing' : 'done');
    } else if (button.dataset.restoreTask) archiveTask(button.dataset.restoreTask, false);
    else if (button.dataset.deleteCard) {
        const id = button.dataset.deleteCard;
        confirm('taskDeleteTitle', 'taskDeleteCopy', () =>
            commit((next) => {
                next.tasks = next.tasks.filter((task) => task.id !== id);
            }, 'deleted')
        );
    } else if (button.dataset.view) navigate(button.dataset.view);
    else if (button.dataset.project) navigate('board', button.dataset.project);
    else if (button.hasAttribute('data-new-project') || button.id === 'add-project') openProject();
    else if (button.id === 'edit-project') openProject(projectId);
    else if (button.id === 'new-task') openTask();
    else if (button.dataset.addStatus) openTask(null, button.dataset.addStatus);
    else if (button.dataset.editTask) openTask(button.dataset.editTask);
    else if (button.dataset.mobileStatus) {
        mobileStatus = button.dataset.mobileStatus;
        render(true);
    }
});
content.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-card-check]');
    if (!checkbox) return;
    const card = checkbox.closest('[data-task]');
    const checked = checkbox.checked;
    const saved = commit(
        (next) => {
            const task = next.tasks.find((task) => task.id === card.dataset.task);
            const item = task?.checklist.find((item) => item.id === checkbox.dataset.cardCheck);
            if (!item) {
                notify(t('checklistItemMissing'));
                return false;
            }
            item.done = checked;
        },
        null,
        false
    );
    if (!saved) {
        checkbox.checked = !checked;
        return;
    }
    const task = data.tasks.find((task) => task.id === card.dataset.task);
    const completed = task.checklist.filter((item) => item.done).length;
    const status = card.querySelector('.task-status');
    if (status) status.textContent = statusLabel(task);
    card.querySelector('.task-progress')?.style.setProperty(
        '--progress',
        `${task.checklist.length ? (completed / task.checklist.length) * 100 : 0}%`
    );
});
$('#search').addEventListener('input', (event) => {
    search = event.target.value;
    render();
});
$('#priority-filter').addEventListener('change', (event) => {
    priority = event.target.value;
    render();
});
content.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-task]');
    if (!card || event.target.closest('button, select, input, label')) {
        event.preventDefault();
        return;
    }
    draggingTask = card.dataset.task;
    event.dataTransfer.setData('text/plain', draggingTask);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
});
content.addEventListener('dragover', (event) => {
    const lane = event.target.closest('.lane');
    if (!lane || !draggingTask) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    content
        .querySelectorAll('.is-drop-target')
        .forEach((item) => item.classList.toggle('is-drop-target', item === lane));
    lane.classList.add('is-drop-target');
});
function clearDrag() {
    draggingTask = null;
    content
        .querySelectorAll('.is-dragging, .is-drop-target')
        .forEach((element) => element.classList.remove('is-dragging', 'is-drop-target'));
}
content.addEventListener('drop', (event) => {
    const lane = event.target.closest('.lane');
    if (!lane || !draggingTask) return;
    event.preventDefault();
    moveTask(draggingTask, lane.dataset.status);
    clearDrag();
});
content.addEventListener('dragend', clearDrag);
$('.brand').addEventListener('click', (event) => {
    event.preventDefault();
    navigate('overview');
});
window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (['board', 'overview', 'upcoming', 'archive'].includes(next)) navigate(next);
});
window.addEventListener('storage', (event) => {
    if (!isDataEvent(event)) return;
    const stored = readData();
    if (!stored.error) {
        data = stored.data;
        render();
    }
});
translateInterface();
if (initial.error) notify(t('loadError'));
