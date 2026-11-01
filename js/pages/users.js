/* Users — admin manages every account: add, edit, reset password, delete */
(function () {
  const me = OS.requireAuth(['admin']);
  if (!me) return;
  OS.shell('users');
  const $ = OS.$, esc = OS.esc;
  const state = { q: '', role: 'All' };
  $('#searchIcon').outerHTML = OS.icon('search', 18);
  $('#addBtn').innerHTML = OS.icon('plus', 18) + 'Add user';

  const ROLES = ['student', 'faculty', 'librarian', 'admin'];
  const ID_HINT = { student: 'e.g. 24BCS050', faculty: 'e.g. FAC-3001', librarian: 'e.g. LIB-002', admin: 'e.g. ADM-002' };

  async function render() {
    const list = await OS.api.listUsers(state);
    $('#countText').textContent = `${list.length} account${list.length === 1 ? '' : 's'} shown`;
    $('#table').innerHTML = list.length ? `
      <table>
        <thead><tr><th>User</th><th>Role</th><th>Department</th><th class="num">Books issued</th><th></th></tr></thead>
        <tbody>${list.map((u) => `
          <tr>
            <td><div class="cell-book"><span class="avatar">${esc(OS.initials(u.name))}</span><div><b>${esc(u.name)}${u.id === me.id ? ' <span class="badge gray">You</span>' : ''}</b><span class="muted" style="font-size:13px">${esc(u.id)} · ${esc(u.email)}</span></div></div></td>
            <td><span class="badge ${OS.roleBadge(u.role)}">${OS.roleLabel(u.role)}</span></td>
            <td class="muted">${esc(u.dept)}</td>
            <td class="num">${OS.isMember(u) ? u.activeLoans : '—'}</td>
            <td class="num" style="white-space:nowrap">
              <button class="icon-btn" type="button" data-edit="${esc(u.id)}" aria-label="Edit ${esc(u.name)}" title="Edit">${OS.icon('edit', 16)}</button>
              <button class="icon-btn" type="button" data-pwd="${esc(u.id)}" aria-label="Reset password for ${esc(u.name)}" title="Reset password">${OS.icon('key', 16)}</button>
              ${u.id === me.id ? '' : `<button class="icon-btn danger" type="button" data-del="${esc(u.id)}" aria-label="Delete ${esc(u.name)}" title="Delete">${OS.icon('trash', 16)}</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty" style="margin:12px 0">No users match.</div>';

    OS.$$('[data-edit]').forEach((b) => b.addEventListener('click', () => userForm(list.find((u) => u.id === b.dataset.edit))));
    OS.$$('[data-pwd]').forEach((b) => b.addEventListener('click', () => passwordForm(list.find((u) => u.id === b.dataset.pwd))));
    OS.$$('[data-del]').forEach((b) => b.addEventListener('click', () => removeUser(list.find((u) => u.id === b.dataset.del))));
  }

  // Add (u = undefined) or edit (u = existing user)
  async function userForm(u) {
    const isNew = !u;
    const v = u || { id: '', name: '', role: 'student', dept: '', email: '' };
    const saved = await OS.modal({
      title: isNew ? 'Add user' : 'Edit user',
      okLabel: isNew ? 'Add user' : 'Save changes',
      body: `
        <div class="field"><label for="fRole">Role</label>
          <select class="input" id="fRole" name="role">${ROLES.map((r) => `<option value="${r}" ${r === v.role ? 'selected' : ''}>${OS.roleLabel(r)}</option>`).join('')}</select></div>
        <div class="field"><label for="fId">User ID</label>
          <input class="input" id="fId" name="id" value="${esc(v.id)}" placeholder="${ID_HINT[v.role]}" ${isNew ? '' : 'disabled'} autocomplete="off"></div>
        <div class="field"><label for="fName">Full name</label>
          <input class="input" id="fName" name="name" value="${esc(v.name)}" placeholder="e.g. Priya Sharma" autocomplete="off"></div>
        <div class="field"><label for="fDept">Department</label>
          <input class="input" id="fDept" name="dept" value="${esc(v.dept)}" placeholder="e.g. CSBS" autocomplete="off"></div>
        <div class="field"><label for="fEmail">Email</label>
          <input class="input" id="fEmail" name="email" type="email" value="${esc(v.email)}" placeholder="name@college.edu" autocomplete="off"></div>
        ${isNew ? `<div class="field"><label for="fPwd">Password</label>
          <input class="input" id="fPwd" name="password" type="password" placeholder="At least 6 characters" autocomplete="new-password"></div>` : ''}`,
      onOk: (form) => {
        const data = Object.fromEntries(new FormData(form));
        return isNew ? OS.api.addUser(data) : OS.api.updateUser(v.id, data);
      }
    });
    if (saved) { OS.toast(isNew ? `${saved.name} added as ${OS.roleLabel(saved.role).toLowerCase()}.` : 'Changes saved.', 'success'); render(); }
  }

  // Keep the ID placeholder in sync with the chosen role in the Add form
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'fRole') { const id = $('#fId'); if (id && !id.disabled) id.placeholder = ID_HINT[e.target.value]; }
  });

  async function passwordForm(u) {
    const done = await OS.modal({
      title: 'Reset password',
      okLabel: 'Reset password',
      body: `<p class="muted">Set a new password for <b>${esc(u.name)}</b> (${esc(u.id)}). Share it with them securely.</p>
        <div class="field"><label for="fNew">New password</label>
          <input class="input" id="fNew" name="password" type="password" placeholder="At least 6 characters" autocomplete="new-password"></div>`,
      onOk: (form) => OS.api.resetPassword(u.id, form.password.value)
    });
    if (done) OS.toast(`Password reset for ${u.name}.`, 'success');
  }

  async function removeUser(u) {
    if (!(await OS.confirm('Delete this account?', `${u.name} (${u.id}) will no longer be able to sign in. This can't be undone.`, 'Delete', true))) return;
    try { await OS.api.deleteUser(u.id, me.id); OS.toast(`${u.name} deleted.`, 'success'); render(); }
    catch (e) { OS.toast(e.message, 'error'); }
  }

  $('#addBtn').addEventListener('click', () => userForm());
  $('#q').addEventListener('input', OS.debounce(() => { state.q = $('#q').value; render(); }, 150));
  OS.$$('#roleFilter button').forEach((b) => b.addEventListener('click', () => {
    state.role = b.dataset.role;
    OS.$$('#roleFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  render().then(() => { if (new URLSearchParams(location.search).get('add')) userForm(); })
    .catch((e) => OS.toast(e.message, 'error'));
})();
