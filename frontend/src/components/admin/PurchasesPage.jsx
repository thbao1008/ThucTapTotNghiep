import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import { FiArrowLeft, FiRefreshCw, FiPackage, FiCalendar, FiClock, FiCheck, FiAlertCircle } from 'react-icons/fi';
import api from '../../api';
import Modal from '../common/Modal.jsx';
import '../../styles/admin-commerce-refresh.css';

const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-GB') : '—';
const money = value => value == null ? '—' : Number(value).toLocaleString('en-GB', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function PurchasesPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const learnerId = id || searchParams.get('learnerId');
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null);
  const [showChangePackageModal, setShowChangePackageModal] = useState(false);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packageError, setPackageError] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(null);

  async function loadPurchases(signal) {
    setLoading(true); setError('');
    try {
      if (!learnerId) throw new Error('Missing learner');
      const { data } = await api.get(`/admin/purchases/${learnerId}`, { signal });
      if (!signal?.aborted) setPurchases(data.purchases || []);
    } catch { if (!signal?.aborted) setError('Unable to load purchases. Please try again.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); loadPurchases(controller.signal); return () => controller.abort(); }, [learnerId]);
  useEffect(() => {
    if (!showChangePackageModal) return;
    const controller = new AbortController(); setPackagesLoading(true); setPackageError('');
    api.get('/admin/packages/public', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setPackages(Array.isArray(data) ? data : data.packages || []);
    }).catch(() => { if (!controller.signal.aborted) setPackageError('Unable to load packages. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setPackagesLoading(false); });
    return () => controller.abort();
  }, [showChangePackageModal]);

  async function handleRenew(purchaseId) {
    if (pending) return;
    setPending(`renew-${purchaseId}`); setError(''); setNotice('');
    try {
      const { data } = await api.patch(`/admin/purchases/${purchaseId}/renew`);
      if (data.success) { setNotice(data.message || 'Gia hạn thành công'); await loadPurchases(); }
    } catch (failure) { setError(failure.response?.data?.message || 'Có lỗi xảy ra khi gia hạn'); }
    finally { setPending(null); }
  }
  async function handleChangePackage() {
    if (!selectedPackageId || pending) return;
    setPending('change'); setPackageError(''); setNotice('');
    try {
      const { data } = await api.post('/admin/purchases/change-package', { learnerId, newPackageId: selectedPackageId });
      if (data.success) {
        setNotice(data.message || 'Đổi gói thành công'); setShowChangePackageModal(false);
        setSelectedPackageId(null); await loadPurchases();
      }
    } catch (failure) { setPackageError(failure.response?.data?.message || 'Có lỗi xảy ra khi đổi gói'); }
    finally { setPending(null); }
  }
  const learnerName = purchases[0]?.learner_name || `Learner #${learnerId}`;
  const hasActivePackage = purchases.some(purchase => purchase.is_active === true);
  const latestExpiredPurchase = purchases.find(purchase => purchase.effective_status === 'expired');
  return <div className="admin-workspace-page admin-purchases-page admin-purchase-history-page">
    <Link to="/admin/purchases" className="commerce-back-link"><FiArrowLeft aria-hidden="true"/><UiText>All purchases</UiText></Link>
    <header className="admin-page-heading"><div><span className="admin-page-kicker">AESP ADMIN</span><h1><UiText text="Lịch sử Gói Học"/></h1><p><UiText text="Quản lý tất cả các gói học của"/> <strong>{learnerName}</strong></p></div><div className="admin-page-actions"><button type="button" className="btn btn-primary" disabled={hasActivePackage || Boolean(pending) || loading} onClick={() => { setSelectedPackageId(null); setShowChangePackageModal(true); }}><FiRefreshCw aria-hidden="true"/><UiText text="Đổi gói học"/></button></div></header>
    {error && <div role="alert" className="admin-error commerce-inline-error"><UiText>{error}</UiText><button type="button" className="btn btn-ghost" onClick={() => loadPurchases()} disabled={loading}><FiRefreshCw aria-hidden="true"/><UiText>Retry</UiText></button></div>}
    {notice && <p role="status" className="commerce-success"><FiCheck aria-hidden="true"/><UiText>{notice}</UiText></p>}
    {hasActivePackage && <p className="commerce-access-note"><FiClock aria-hidden="true"/><UiText>The current package runs until its expiry date. Renew or change it after it expires.</UiText></p>}
    {loading && !purchases.length ? <div className="admin-empty" role="status"><UiText text="Đang tải dữ liệu..."/></div> : !purchases.length ? <div className="admin-empty"><FiPackage aria-hidden="true"/><p><UiText text="Học viên này chưa đăng ký gói học nào"/></p></div> : <section className="commerce-history-list" aria-busy={loading}>
      {purchases.map(purchase => {
        const isLatestExpired = latestExpiredPurchase?.purchase_id === purchase.purchase_id;
        const canRenew = isLatestExpired && !hasActivePackage;
        const status = purchase.is_active ? 'active' : purchase.effective_status === 'expired' ? 'expired' : 'unavailable';
        return <article className="commerce-history-card" key={purchase.purchase_id || purchase.id}>
          <header className="commerce-history-heading"><div className="commerce-package-name"><span className="commerce-item-mark"><FiPackage aria-hidden="true"/></span><div><h2>{purchase.package_name || englishText('Chưa có gói')}</h2><small>#{purchase.purchase_id || purchase.id}</small></div></div><span className={`commerce-status ${status}`}><UiText>{status === 'active' ? 'Còn hạn' : status === 'expired' ? 'Hết hạn' : 'Không khả dụng'}</UiText></span></header>
          <dl className="commerce-purchase-facts"><div><dt><FiCalendar aria-hidden="true"/><UiText>Purchased</UiText></dt><dd>{date(purchase.created_at)}</dd></div><div><dt><FiCalendar aria-hidden="true"/><UiText>Expires</UiText></dt><dd>{date(purchase.expiry_date)}</dd></div><div><dt><FiClock aria-hidden="true"/><UiText text="Còn lại"/></dt><dd>{purchase.days_left ?? 0} <UiText text="ngày"/></dd></div><div><dt><UiText text="Giá gói hiện tại"/></dt><dd>{money(purchase.price)}</dd></div></dl>
          {canRenew && <footer className="commerce-history-actions"><span><FiAlertCircle aria-hidden="true"/><UiText text="Gói gần nhất đã hết hạn"/></span><button type="button" className="btn btn-secondary" disabled={Boolean(pending) || loading} onClick={() => handleRenew(purchase.purchase_id || purchase.id)}><FiRefreshCw aria-hidden="true"/><UiText>{pending === `renew-${purchase.purchase_id || purchase.id}` ? 'Saving...' : 'Gia hạn'}</UiText></button></footer>}
        </article>;
      })}
    </section>}
    {showChangePackageModal && <Modal title={englishText('Chọn gói học mới')} className="admin-commerce-modal commerce-change-modal" onClose={() => { if (!pending) setShowChangePackageModal(false); }}>
      {packageError && <p className="commerce-form-error" role="alert"><UiText>{packageError}</UiText></p>}
      {packagesLoading ? <p role="status"><UiText text="Đang tải danh sách gói..."/></p> : !packages.length ? <p><UiText text="Không có gói học nào"/></p> : <fieldset className="commerce-plan-options"><legend className="commerce-sr-only"><UiText text="Chọn gói học mới"/></legend>{packages.map(pkg => <label key={pkg.id} className={`commerce-plan-option${selectedPackageId === pkg.id ? ' selected' : ''}`}><input type="radio" name="new-package" checked={selectedPackageId === pkg.id} onChange={() => setSelectedPackageId(pkg.id)} value={pkg.id}/><span><strong>{pkg.name}</strong><small>{pkg.duration_days} <UiText text="ngày"/></small></span><b>{money(pkg.price)}</b></label>)}</fieldset>}
      <div className="commerce-form-actions"><button type="button" className="btn btn-ghost" disabled={Boolean(pending)} onClick={() => setShowChangePackageModal(false)}><UiText text="Hủy"/></button><button type="button" className="btn btn-primary" disabled={!selectedPackageId || Boolean(pending) || packagesLoading} onClick={handleChangePackage}><UiText>{pending === 'change' ? 'Saving...' : 'Xác nhận'}</UiText></button></div>
    </Modal>}
  </div>;
}
