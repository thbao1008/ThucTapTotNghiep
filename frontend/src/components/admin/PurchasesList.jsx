import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { englishText,selectUiCopy } from '../../i18n/uiLanguage.js';
import { UiText,useUiLanguage } from '../../i18n/UiLanguage.jsx';
import { FiSearch, FiArrowUpRight, FiShoppingBag, FiRefreshCw } from 'react-icons/fi';
import UserAvatar from '../common/UserAvatar.jsx';
import api from '../../api';
import '../../styles/admin-commerce-refresh.css';

const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-GB') : '—';
const money = value => value == null ? '—' : Number(value).toLocaleString('en-GB', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function PurchasesList({ learnerId }) {
  const {locale}=useUiLanguage();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timeout = setTimeout(async () => {
      try {
        const route = learnerId ? `/admin/purchases/${learnerId}` : `/admin/purchases${searchPhone.trim() ? `?phone=${encodeURIComponent(searchPhone.trim())}` : ''}`;
        const { data } = await api.get(route, { signal: controller.signal });
        if (!controller.signal.aborted) setPurchases(data.purchases || []);
      } catch {
        if (!controller.signal.aborted) { setPurchases([]); setError('Unable to load purchases. Please try again.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, learnerId ? 0 : 300);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [searchPhone, learnerId, reload]);

  return <div className="admin-workspace-page admin-purchases-page">
    <header className="admin-page-heading"><div><span className="admin-page-kicker">AESP ADMIN</span><h1><UiText>Purchases</UiText></h1><p><UiText>Review package registrations and learner access.</UiText></p></div></header>
    <section className="commerce-surface">
      <div className="commerce-table-toolbar">
        {!learnerId && <label className="commerce-search"><FiSearch aria-hidden="true"/><span className="commerce-sr-only"><UiText>Search by phone number</UiText></span><input type="search" inputMode="tel" value={searchPhone} onChange={event => setSearchPhone(event.target.value)} placeholder={selectUiCopy('Tìm kiếm theo số điện thoại...',locale).text} aria-label={englishText('Search by phone number')}/></label>}
        <div className="commerce-toolbar-meta">{loading ? <span role="status"><UiText text="Đang tải dữ liệu..."/></span> : <span>{purchases.length} <UiText>registrations</UiText></span>}<button type="button" className="commerce-icon-button" aria-label={englishText('Refresh purchases')} title={englishText('Refresh purchases')} disabled={loading} onClick={() => setReload(previous => previous + 1)}><FiRefreshCw aria-hidden="true"/></button></div>
      </div>
      {error && <p className="admin-error" role="alert"><UiText>{error}</UiText></p>}
      <div className="admin-table-wrap"><table className="table commerce-purchase-table"><thead><tr><th scope="col"><UiText>Learner</UiText></th><th scope="col"><UiText text="Tên gói"/></th><th scope="col"><UiText>Status</UiText></th><th scope="col"><UiText>Purchased</UiText></th><th scope="col"><UiText>Expires</UiText></th><th scope="col"><UiText text="Giá gói hiện tại"/></th><th scope="col"><UiText text="Thao tác"/></th></tr></thead>
        <tbody>{loading && !purchases.length ? <tr><td colSpan="7" className="commerce-table-empty" role="status"><UiText text="Đang tải dữ liệu..."/></td></tr> : !purchases.length ? <tr><td colSpan="7" className="commerce-table-empty"><FiShoppingBag aria-hidden="true"/><UiText>{searchPhone.trim() ? 'No purchases match this phone number.' : 'Chưa có học viên nào đăng ký gói học'}</UiText></td></tr> : purchases.map(p => {
          const status = p.is_active ? 'active' : p.effective_status === 'expired' ? 'expired' : 'unavailable';
          return <tr key={p.purchase_id || p.id}>
            <td><div className="commerce-learner"><UserAvatar src={p.learner_avatar_url || p.avatar_url} name={p.learner_name} size={34}/><div><strong>{p.learner_name || '—'}</strong><small>{p.phone || p.email || '—'}</small></div></div></td>
            <td><span className="commerce-package-label">{p.package_name || '—'}</span><small className="commerce-cell-note">#{p.purchase_id || p.id}</small></td>
            <td><span className={`commerce-status ${status}`}><UiText>{status === 'active' ? 'Còn hạn' : status === 'expired' ? 'Hết hạn' : 'Không khả dụng'}</UiText></span></td>
            <td className="commerce-date">{date(p.created_at)}</td><td className="commerce-date">{date(p.expiry_date)}</td><td className="commerce-price">{money(p.price)}</td>
            <td><button type="button" className="commerce-text-action" onClick={() => navigate(`/admin/purchases/${p.learner_id}`)}><UiText text="Xem chi tiết"/><FiArrowUpRight aria-hidden="true"/></button></td>
          </tr>;
        })}</tbody></table></div>
    </section>
  </div>;
}
