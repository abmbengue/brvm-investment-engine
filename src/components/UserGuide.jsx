/**
 * In-app user guide — explains engine usage and data limits.
 */
export default function UserGuide({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="guide-panel">
        <div className="guide-header">
          <h2 id="guide-title">Guide d’utilisation</h2>
          <button type="button" className="guide-close" onClick={onClose} aria-label="Fermer le guide">
            Fermer
          </button>
        </div>
        <div className="guide-body">
          <section>
            <h3>1. Choisir son profil</h3>
            <p>
              Prudent / Équilibré / Dynamique changent réserve de cash, nombre de lignes, score minimum et
              stress. Ce n’est pas une promesse de rendement.
            </p>
          </section>
          <section>
            <h3>2. Renseigner son capital</h3>
            <p>
              <b>Cash spot</b> = argent disponible maintenant. <b>Apport mensuel</b> = flux futur pour la
              simulation patrimoniale uniquement (pas un ordre automatique).
            </p>
          </section>
          <section>
            <h3>3. Déclarer ses holdings</h3>
            <p>
              Symbole BRVM, quantité, prix moyen optionnel. La valorisation utilise le dernier cours
              disponible dans les données — jamais inventé. Si prix N/D, le titre reste non valorisé.
            </p>
          </section>
          <section>
            <h3>4. Comprendre le ranking</h3>
            <p>
              Le score Predictor combine les facteurs disponibles (momentum, liquidité, risque,
              fondamentaux s’ils existent). Un score élevé n’est <b>pas une garantie</b>.
            </p>
          </section>
          <section>
            <h3>5. Comprendre l’allocation</h3>
            <p>
              Poids actuel vs cible, écart, montant d’achat proposé avec le cash spot. Diversification et
              plafond de poids dépendent du profil.
            </p>
          </section>
          <section>
            <h3>6. Comprendre le stress</h3>
            <p>
              Scénarios de simulation (profil + calibration annuelle d’indice PRICE_INDEX). Ce ne sont
              pas des prévisions.
            </p>
          </section>
          <section>
            <h3>7. Decision Center</h3>
            <p>
              BUY / ADD / HOLD-équivalent / REDUCE / EXIT / WAIT / NO ACTION. Chaque ligne explique le
              pourquoi. <b>Décision analytique — ne constitue pas un ordre de bourse.</b>
            </p>
          </section>
          <section>
            <h3>8. Comprendre les données</h3>
            <p>
              <b>INTERNAL ≠ LIVE.</b> Historique public jusqu’à <b>J-1</b> (asOf affiché). SAMPLE = démo.
              CSV = import utilisateur. Indice annuel = PRICE_INDEX pour régimes/stress, pas des prix de
              titres.
            </p>
          </section>
          <section>
            <h3>9. Backtest</h3>
            <p className="yellow">
              <b>BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT</b>
            </p>
            <p>
              Un vrai backtest titres exige un daily officiel/autorisé :
              date,symbol,open,high,low,close,volume.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
