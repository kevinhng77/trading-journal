import { listTradingAccounts, setActiveAccountId } from "../storage/tradingAccounts";
import { useActiveAccountId } from "../hooks/useActiveAccountId";

export default function ShellAccountStrip() {
  const active = useActiveAccountId();
  const accounts = listTradingAccounts();

  return (
    <header className="shell-account-strip" aria-label="Trading account">
      <div className="shell-account-strip-inner">
        <span className="shell-account-strip-label">Account</span>
        <div className="shell-account-pills" role="tablist">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={active === a.id}
              className={`shell-account-pill ${active === a.id ? "is-active" : ""}`}
              onClick={() => setActiveAccountId(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
