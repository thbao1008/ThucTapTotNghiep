import React, { useEffect, useState } from 'react';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import api from '../../api';
import Modal from '../common/Modal.jsx';
import { FiPlus, FiTrash2, FiEdit2, FiPackage, FiRefreshCw } from 'react-icons/fi';
import '../../styles/admin-commerce-refresh.css';

const money = value => Number(value).toLocaleString('en-GB', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function PackagesList() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [formError, setFormError] = useState('');

  async function loadPackages(signal) {
    setLoading(true); setLoadError('');
    try {
      const { data } = await api.get('/admin/packages', { signal });
      if (!signal?.aborted) setPackages(Array.isArray(data) ? data : data.packages || []);
    } catch {
      if (!signal?.aborted) setLoadError('Unable to load packages. Please try again.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); loadPackages(controller.signal); return () => controller.abort(); }, []);

  function openEditor(pkg = null) {
    setEditing(pkg); setName(pkg?.name || ''); setPrice(pkg?.price ?? '');
    setOriginalPrice(pkg?.original_price ?? ''); setDurationDays(pkg?.duration_days ?? '');
    setFormError(''); setShowModal(true);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const payload = { name: String(name).trim(), price: Number(price), original_price: Number(originalPrice), duration_days: Number(durationDays) };
    if (!payload.name || !Number.isSafeInteger(payload.price) || payload.price < 0 || !Number.isSafeInteger(payload.duration_days) || payload.duration_days < 1
      || !Number.isSafeInteger(payload.original_price) || payload.original_price < 0) {
      setFormError('Vui lòng nhập đủ thông tin gói học.'); return;
    }
    setSaving(true); setFormError('');
    try {
      if (editing) await api.put(`/admin/packages/${editing.id}`, payload);
      else await api.post('/admin/packages', payload);
      setShowModal(false); await loadPackages();
    } catch (error) { setFormError(error.response?.data?.error || error.response?.data?.message || 'Không thể lưu gói học'); }
    finally { setSaving(false); }
  }
  async function handleDelete(id) {
    if (deleting !== null || !window.confirm(englishText('Bạn có chắc muốn xóa gói học này?'))) return;
    setDeleting(id); setLoadError('');
    try { await api.delete(`/admin/packages/${id}`); setPackages(previous => previous.filter(pkg => pkg.id !== id)); }
    catch (error) { setLoadError(error.response?.data?.error || error.response?.data?.message || 'Không thể xóa gói học'); }
    finally { setDeleting(null); }
  }
  return <div className="admin-workspace-page admin-packages-page packages-list">
    <header className="admin-page-heading">
      <div><span className="admin-page-kicker">AESP ADMIN</span><h1><UiText>Packages</UiText></h1><p><UiText>Manage pricing and access periods.</UiText></p></div>
      <div className="admin-page-actions"><button className="btn btn-primary" onClick={() => openEditor()}><FiPlus aria-hidden="true"/><UiText text="Thêm gói học"/></button></div>
    </header>
    {loadError && <div role="alert" className="admin-error commerce-inline-error"><UiText>{loadError}</UiText><button type="button" className="btn btn-ghost" onClick={() => loadPackages()}><FiRefreshCw aria-hidden="true"/><UiText>Retry</UiText></button></div>}
    <section className="commerce-surface">
      <div className="commerce-section-heading"><h2><UiText>Package catalog</UiText></h2>{!loading && <span className="commerce-result-count">{packages.length} <UiText>packages</UiText></span>}</div>
      <div className="admin-table-wrap"><table className="table commerce-package-table">
        <thead><tr><th scope="col"><UiText text="Tên gói"/></th><th scope="col"><UiText text="Giá gốc"/></th><th scope="col"><UiText text="Giá bán"/></th><th scope="col"><UiText>Access period</UiText></th><th scope="col" className="commerce-actions-heading"><UiText text="Thao tác"/></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="5" className="commerce-table-empty" role="status"><UiText text="Đang tải dữ liệu..."/></td></tr> : packages.length === 0 ? <tr><td colSpan="5" className="commerce-table-empty"><FiPackage aria-hidden="true"/><UiText text="Chưa có gói học nào."/></td></tr> : packages.map(pkg => <tr key={pkg.id}>
          <td><div className="commerce-package-name"><span className="commerce-item-mark"><FiPackage aria-hidden="true"/></span><div><strong>{pkg.name}</strong><small>#{pkg.id}</small></div></div></td>
          <td className="commerce-price-muted">{pkg.original_price == null ? '—' : money(pkg.original_price)}</td>
          <td className="commerce-price">{money(pkg.price ?? 0)}</td>
          <td><span className="commerce-duration">{pkg.duration_days} <UiText text="ngày"/></span></td>
          <td><div className="commerce-row-actions"><button type="button" className="commerce-icon-button" aria-label={englishText('Sửa gói học')} title={englishText('Sửa gói học')} onClick={() => openEditor(pkg)}><FiEdit2 aria-hidden="true"/></button><button type="button" className="commerce-icon-button danger" aria-label={englishText('Delete package')} title={englishText('Delete package')} disabled={deleting !== null} onClick={() => handleDelete(pkg.id)}><FiTrash2 aria-hidden="true"/></button></div></td>
        </tr>)}</tbody>
      </table></div>
    </section>
    {showModal && <Modal title={englishText(editing ? 'Sửa gói học' : 'Tạo gói học')} className="admin-commerce-modal" onClose={() => { if (!saving) setShowModal(false); }}>
      <form onSubmit={handleSubmit} className="commerce-form">
        {formError && <p className="commerce-form-error" role="alert"><UiText>{formError}</UiText></p>}
        <div className="commerce-field full"><label htmlFor="admin-package-name"><UiText text="Tên gói"/></label><input id="admin-package-name" value={name} onChange={event => setName(event.target.value)} required maxLength={100}/></div>
        <div className="commerce-field"><label htmlFor="admin-package-original"><UiText text="Giá gốc (VNĐ)"/></label><input id="admin-package-original" type="number" min="0" step="1" value={originalPrice} onChange={event => setOriginalPrice(event.target.value)}/></div>
        <div className="commerce-field"><label htmlFor="admin-package-price"><UiText text="Giá bán (VNĐ)"/></label><input id="admin-package-price" type="number" min="0" step="1" value={price} onChange={event => setPrice(event.target.value)} required/></div>
        <div className="commerce-field full"><label htmlFor="admin-package-duration"><UiText text="Thời hạn (ngày)"/></label><input id="admin-package-duration" type="number" min="1" step="1" value={durationDays} onChange={event => setDurationDays(event.target.value)} required/></div>
        <div className="commerce-form-actions"><button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setShowModal(false)}><UiText text="Hủy"/></button><button type="submit" className="btn btn-primary" disabled={saving}><UiText>{saving ? 'Saving...' : editing ? 'Cập nhật' : 'Tạo'}</UiText></button></div>
      </form>
    </Modal>}
  </div>;
}
