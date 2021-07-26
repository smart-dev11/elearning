import {
  Box,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Tab,
  Tabs
} from '@material-ui/core';
import { Bookmark, CreditCard } from '@material-ui/icons';
import { WithTranslation } from 'next-i18next';
import React from 'react';
import { withTranslation } from '../../shared/i18n';
import {
  GatewayConfig,
  PaymentData,
  PaymentFacade,
  PaymentProcessor,
  VaultedPayment
} from '../../types/payment';
import { User } from '../graphql/data-models';
import { logEvent } from '../lib/analytics';
import BraintreeClient from '../lib/braintree-client';
import { Icon, PaymentIcons } from './payment-icons';
import PaymentModuleAlipay from './payment-module-alipay';
import {
  hostedFieldOptions,
  PaymentModuleCreditCard
} from './payment-module-credit-card';
import PaymentModulePaypal from './payment-module-paypal';
import { PaymentVault } from './payment-vault';
import TabPanel from './tab-panel';

interface Props extends WithTranslation {
  user: User;
  price: number;
  onFormValidityChange?: (payment: PaymentFacade) => void;
  onError: (err: Error) => void;
}

interface State {
  cardType: string;
  isProcessing: boolean;
  isFormReady: boolean;
  cardholderName: string;
  savePaymentToVault: boolean;
  cvvEnabled: boolean;
  postalCodeEnabled: boolean;
  vaultedPayments: VaultedPayment[];
  vaultedSelectedToken: string | null;
  gateway?: GatewayConfig;
  payments: Record<PaymentProcessor, PaymentData>;
  tab: PaymentProcessor;
}

class PaymentModule extends React.Component<Props, State> {
  container: React.RefObject<HTMLDivElement>;
  client?: BraintreeClient;

  constructor(props: Props) {
    super(props);

    this.container = React.createRef<HTMLDivElement>();
    this.state = {
      cardType: '',
      isProcessing: false,
      isFormReady: false,
      cardholderName: '',
      savePaymentToVault: true,
      vaultedPayments: [],
      vaultedSelectedToken: null,
      tab: 'card',
      cvvEnabled: true,
      postalCodeEnabled: true,
      payments: {
        vault: { isValid: false },
        card: { isValid: false },
        paypal: { isValid: false },
        alipay: { isValid: false }
      }
    };
  }

  getPaymentForCurrentTab() {
    const { payments, tab } = this.state;
    return payments[tab];
  }

  onVaultSelectionChange = (token: string) => {
    const { payments } = this.state;
    this.setState(
      {
        vaultedSelectedToken: token,
        payments: {
          ...payments,
          vault: {
            isValid: true,
            tokenize: () => Promise.resolve(token)
          }
        }
      },
      this.handleFormValidityChange
    );
  };

  handleFormValidityChange = () => {
    const { tab, cardType, cardholderName, savePaymentToVault } = this.state;

    const payment = this.getPaymentForCurrentTab();

    if (payment.isValid) {
      if (tab === 'card') {
        this.props.onFormValidityChange({
          isValid: true,
          tokenize: () =>
            payment.tokenize({ cardholderName, vault: savePaymentToVault })
        });
      } else {
        this.props.onFormValidityChange({
          isValid: true,
          tokenize: () => payment.tokenize({})
        });
      }
    } else {
      this.props.onFormValidityChange({
        isValid: false
      });
    }

    logEvent('CardValidityChange', {
      label: tab,
      variant: cardType,
      isValid: payment.isValid
    });
  };

  componentDidMount() {
    this.client = new BraintreeClient({
      authorization: this.props.user.braintreeToken,
      fields: hostedFieldOptions,
      eventHandlers: {
        onSetUpSuccess: this.onSetUpSuccess,
        onError: this.props.onError,
        onFormValidityChange: this.onFormValidityChange,
        onCardTypeChange: cardType => this.setState({ cardType }),
        onProcessing: isProcessing => this.setState({ isProcessing })
      }
    });
  }

  componentWillUnmount() {
    if (this.client) {
      this.client.teardown();
    }
  }

  onSetUpSuccess = (cfg: GatewayConfig, vaultedPayments: VaultedPayment[]) => {
    this.setState(
      {
        isFormReady: true,
        tab: vaultedPayments.length ? 'vault' : 'card',
        vaultedPayments,
        cvvEnabled: cfg.challenges.includes(hostedFieldOptions.cvv.challenge),
        postalCodeEnabled: cfg.challenges.includes(
          hostedFieldOptions.postalCode.challenge
        )
      },
      () => {
        if (vaultedPayments.length) {
          this.onVaultSelectionChange(vaultedPayments[0].nonce);
        }
      }
    );
  };

  onFormValidityChange = (type: PaymentProcessor, data: PaymentData) => {
    const payments = { ...this.state.payments };
    payments[type] = data;
    this.setState({ payments }, this.handleFormValidityChange);
  };

  onTabSwitch = (_, tab: PaymentProcessor) => {
    this.setState({ tab }, this.handleFormValidityChange);
  };

  onToggleSaveToVault = (_, checked: boolean) => {
    this.setState({ savePaymentToVault: checked });
  };

  render() {
    const { tab, vaultedPayments, savePaymentToVault } = this.state;
    const { t } = this.props;
    const payment = this.state.payments[tab];

    return (
      <Box p={3} boxShadow={1}>
        {!this.state.isFormReady && <LinearProgress />}
        {/* need to have the elements in DOM to set up braintree,
        but should not make them visible because they're not styled
        until it's finished initializing */}
        <div style={{ display: this.state.isFormReady ? 'block' : 'none' }}>
          <Tabs
            variant="scrollable"
            style={{ marginBottom: 24 }}
            value={tab}
            onChange={this.onTabSwitch}
          >
            {vaultedPayments.length > 0 && <Tab value="vault" icon={<Bookmark />} />}
            <Tab
              value="card"
              icon={<CreditCard />}
              title={t('braintree.card.name')}
            />
            <Tab
              value="paypal"
              title={t('braintree.paypal.name')}
              icon={<PaymentIcons style={{ height: 24 }} type={Icon.PayPal} />}
            />
            <Tab
              value="alipay"
              title={t('braintree.alipay.name')}
              icon={
                <svg height={24} viewBox="0 0 855 300">
                  <path
                    d="m48.508 0c-26.814 0-48.508 21.511-48.508 48.068v203.87c0 26.536 21.694 48.059 48.508 48.059h205.81c26.793 0 48.496-21.522 48.496-48.059v-2.0859c-0.90184-0.37259-78.698-32.52-118.24-51.357-26.677 32.524-61.086 52.256-96.812 52.256-60.412 0-80.927-52.38-52.322-86.861 6.2372-7.516 16.847-14.697 33.314-18.717 25.76-6.2703 66.756 3.9151 105.18 16.477 6.9115-12.614 12.726-26.506 17.057-41.297h-118.41v-11.881h61.057v-21.303h-73.951v-11.891h73.951v-30.389s2e-5 -5.1191 5.2363-5.1191h29.848v35.508h73.107v11.891h-73.107v21.303h59.674c-5.7104 23.176-14.38 44.509-25.264 63.236 18.111 6.4901 34.368 12.646 46.484 16.666 40.413 13.397 51.739 15.034 53.201 15.205v-155.51c0-26.557-21.704-48.068-48.496-48.068h-205.81zm33.207 162.54c-2.5931 0.02976-5.1979 0.16964-7.8223 0.42578-7.5647 0.75369-21.768 4.0611-29.533 10.865-23.274 20.109-9.344 56.871 37.762 56.871 27.383 0 54.743-17.344 76.236-45.115-27.709-13.395-51.576-23.335-76.643-23.047z"
                    fill="#00a1e9"
                  />
                  <path
                    d="m829.48 208.55-13.517 29.164-13.718-29.164h-13.402l20.871 40.322v28.127h12.295v-28.127l0.0738-0.15702 20.787-40.165zm-98.969 17.644 9.5349 28.389h-19.407zm12.464 37.015 4.5936 13.786h12.885l-25.37-68.45h-9.851l-25.286 68.45h12.896l4.7938-13.786zm-96.164-21.937h-13.686v-23.417h13.686c6.8799 0 10.989 5.9772 10.989 11.755 0 5.6527-3.8456 11.661-10.989 11.661m0.69536-32.723h-26.772v68.45h12.39v-26.316h14.381c13.359 0 22.694-8.6674 22.694-21.072s-9.3347-21.061-22.694-21.061m-89.406 68.45h12.401v-68.45h-12.401zm-87.163-68.449v68.45h41.711v-9.3269h-29.321v-59.123zm-70.587 17.644 9.5244 28.389h-19.396zm12.464 37.015 4.5936 13.786h12.875l-25.37-68.45h-9.8405l-25.286 68.45h12.885l4.7938-13.786zm87.23-188.47h-53.153v-18.926h61.635v-11.787h-61.635v-23.982h-27.477c-3.0132 0-5.447 2.5123-5.447 5.6003v18.382h-61.203v11.787h61.203v18.926h-51.657v11.776h102.89s-5.6999 22.119-33.925 45.891c-25.286-19.02-33.736-34.167-33.736-34.167h-27.604c11.168 19.23 27.035 34.628 44.124 46.844-15.698 10.133-36.054 19.9-62.372 27.719v14.111s40.605-7.6102 79.851-30.587c39.309 22.799 78.787 30.587 78.787 30.587v-13.357c-25.265-9.1385-45.283-19.188-61.002-28.881 22.768-16.759 42.723-39.506 50.719-69.936m172.66-52.334h-27.667v28.724h-68.198v11.567h68.198v103.27c-0.24233 2.3658-2.1177 4.2081-4.4672 4.3337h-14.065v11.965h35.864c5.6788-0.23029 10.209-4.9094 10.336-10.709v-108.86h11.231v-11.567h-11.231zm-58.348 59.777c-1.0114-2.0517-3.0765-3.4649-5.4786-3.4858h-23.052l17.964 56.192h27.267zm-68.092-61.137-31.734 74.584h24.348v88.747h26.624v-117.72h-9.6508l20.05-45.609zm308.73 159.26-9.7246-32.639c-0.65322-2.0831-2.5497-3.5905-4.8043-3.5905h-25.781l7.4804 25.071h-30.312v-48.571h59.517v-11.557h-59.517v-22.862h59.517v-11.557h-148.52v11.557h59.506v22.862h-59.506v11.557h59.506v48.571h-59.506v11.557h152.15l-0.12643-0.39778zm-121.2-133.28h86.678v17.052h30.965v-20.203c-0.0105-0.04187-0.0105-0.06281-0.0105-0.11515 0-4.5431-3.5822-8.2173-8.0178-8.2906h-50.108v-15.901h-32.398v15.901h-58.063v28.609h30.954z"
                    fill="#3f3b3a"
                  />
                </svg>
              }
            />
          </Tabs>
          {vaultedPayments.length > 0 && (
            <TabPanel<PaymentProcessor> openTab={tab} tabName="vault">
              <PaymentVault
                selectedToken={this.state.vaultedSelectedToken}
                vaultedPayments={vaultedPayments}
                onChange={this.onVaultSelectionChange}
              />
            </TabPanel>
          )}
          <TabPanel<PaymentProcessor> openTab={tab} tabName="card">
            <PaymentModuleCreditCard
              cardholderName={this.state.cardholderName}
              cvvEnabled={this.state.cvvEnabled}
              postalCodeEnabled={this.state.postalCodeEnabled}
              cardType={this.state.cardType}
              onCardholderNameChange={cardholderName => {
                this.setState({ cardholderName });
              }}
            />
            <FormControlLabel
              checked={savePaymentToVault}
              control={<Checkbox />}
              onChange={this.onToggleSaveToVault}
              label={t('braintree.card.keep')}
            />
          </TabPanel>
          <TabPanel<PaymentProcessor> openTab={tab} tabName="paypal">
            <PaymentModulePaypal
              isProcessing={this.state.isProcessing}
              client={this.client}
              payment={payment}
            />
            <FormControlLabel
              checked={savePaymentToVault}
              control={<Checkbox />}
              onChange={this.onToggleSaveToVault}
              label={t('braintree.paypal.keep')}
            />
          </TabPanel>
          <TabPanel<PaymentProcessor> openTab={tab} tabName="alipay">
            <PaymentModuleAlipay
              user={this.props.user}
              amount={(this.props.price / 100).toFixed(2)}
              isProcessing={this.state.isProcessing}
              client={this.client}
              payment={payment}
            />
          </TabPanel>
        </div>
      </Box>
    );
  }
}

export default withTranslation('checkout')(PaymentModule);
