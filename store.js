const storageKey = 'byedeadline-data-v1';
export const statuses = ['todo', 'doing', 'done'];
export const priorities = ['low', 'medium', 'high'];
export const colors = ['terracotta', 'olive', 'blue', 'purple', 'amber', 'teal', 'rose'];
const legacyColors = { gray: 'teal', sage: 'olive', indigo: 'purple' };
export const createId = () =>
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function emptyData() {
    return { version: 1, projects: [], tasks: [] };
}
function isValid(data) {
    if (data?.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) return false;
    const projectIds = new Set(data.projects.map((project) => project.id));
    return (
        projectIds.size === data.projects.length &&
        new Set(data.tasks.map((task) => task.id)).size === data.tasks.length &&
        data.projects.every(
            (project) =>
                typeof project.id === 'string' &&
                typeof project.name === 'string' &&
                (project.description === undefined || typeof project.description === 'string') &&
                (colors.includes(project.color) || Object.hasOwn(legacyColors, project.color))
        ) &&
        data.tasks.every(
            (task) =>
                typeof task.id === 'string' &&
                typeof task.title === 'string' &&
                typeof task.description === 'string' &&
                projectIds.has(task.projectId) &&
                statuses.includes(task.status) &&
                (task.archived === undefined ||
                    (typeof task.archived === 'boolean' && (!task.archived || task.status === 'done'))) &&
                priorities.includes(task.priority) &&
                typeof task.due === 'string' &&
                (!task.due ||
                    (/^\d{4}-\d{2}-\d{2}$/.test(task.due) &&
                        Number.isFinite(new Date(task.due + 'T12:00:00').getTime()))) &&
                Array.isArray(task.checklist) &&
                task.checklist.every(
                    (item) =>
                        typeof item.id === 'string' &&
                        typeof item.text === 'string' &&
                        typeof item.done === 'boolean'
                )
        )
    );
}
export function readData() {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return { data: emptyData(), error: false };
        const data = JSON.parse(raw);
        if (!isValid(data)) throw new Error('Invalid saved data');
        data.projects = data.projects.map((project) => {
            const normalized = {
                ...project,
                description: project.description ?? '',
                color: legacyColors[project.color] ?? project.color
            };
            delete normalized.sampleKey;
            return normalized;
        });
        return { data, error: false };
    } catch {
        return { data: emptyData(), error: true };
    }
}
export function saveData(data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
}
export function isDataEvent(event) {
    return event.key === storageKey || event.key === null;
}
