import { CreditLedger } from "../../../components/credits/credit-ledger";
import { CreditBalanceCard } from "../../../components/credits/credit-balance-card";

export default function CreditsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Credit ledger
        </h1>
        <p className="text-sm text-neutral-600">
          Credits are reserved at workflow start, decremented on successful
          completion, and refunded on rollback. Every transaction is
          idempotently logged.
        </p>
      </header>

      <CreditBalanceCard />
      <CreditLedger />
    </div>
  );
}
