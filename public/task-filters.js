// Date-only task deadlines follow the application's existing UTC convention.
export function taskDueState(task, today) {
  if (task.data.status === 'Done' || !task.data.due) return '';
  if (task.data.due < today) return 'overdue';
  return task.data.due === today ? 'today' : '';
}

export function filterTasks(rows, {query = '', ownership = 'all', status = 'all', due = 'all', userId, today}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(task =>
    (ownership !== 'mine' || task.owner === userId) &&
    (status === 'all' || task.data.status === status) &&
    (due === 'all' || taskDueState(task, today) === due) &&
    JSON.stringify(task.data).toLowerCase().includes(needle)
  );
}
