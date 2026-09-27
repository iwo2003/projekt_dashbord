"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Lang } from "@/lib/i18n";
import { LanguageSwitch } from "./ui";
import { useI18n } from "./i18n-provider";
import { ShopFrame } from "./shop-theme";

type Seller = { name: string; address: string; email: string; nip: string };
type Kind = "privacy" | "payment" | "refund";
type Section = { heading: string; paragraphs: string[] };

const emptySeller: Seller = { name: "", address: "", email: "", nip: "" };

export function ShopLegalLinks() {
  const { t } = useI18n();
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-fog">
      <Link href="/sklep/prywatnosc">{t.shop.legalPrivacy}</Link>
      <Link href="/sklep/platnosci">{t.shop.legalPayments}</Link>
      <Link href="/sklep/zwroty">{t.shop.legalRefunds}</Link>
    </nav>
  );
}

export function ShopLegal({ kind }: { kind: Kind }) {
  const { lang, t } = useI18n();
  const [seller, setSeller] = useState<Seller>(emptySeller);
  const [template, setTemplate] = useState("helios");

  useEffect(() => {
    void api<{ seller?: Seller; template?: string }>("/api/shop/public")
      .then((data) => {
        if (data.seller) setSeller(data.seller);
        if (data.template) setTemplate(data.template);
      })
      .catch(() => undefined);
  }, []);

  const doc = documents(lang, seller)[kind];

  return (
    <ShopFrame template={template}>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <LanguageSwitch />
      </div>
      <Link className="text-sm text-fog" href="/sklep">
        {t.shop.back}
      </Link>
      {doc.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-6 text-fog">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <ShopLegalLinks />
    </ShopFrame>
  );
}

function who(lang: Lang, seller: Seller) {
  const ready = seller.name && seller.address && seller.email;
  if (lang === "en") {
    if (!ready) return "The seller has not published a name, address and email yet. The shop does not take payment until those details are saved.";
    return `The seller is ${seller.name}, ${seller.address}, email ${seller.email}${seller.nip ? `, tax ID ${seller.nip}` : ""}.`;
  }
  if (!ready) return "Sprzedawca nie podał jeszcze nazwy, adresu i e-maila. Dopóki tych danych nie zapisze, sklep nie przyjmuje płatności.";
  return `Sprzedawcą jest ${seller.name}, ${seller.address}, e-mail ${seller.email}${seller.nip ? `, NIP ${seller.nip}` : ""}.`;
}

function documents(lang: Lang, seller: Seller): Record<Kind, { title: string; sections: Section[] }> {
  const identity = who(lang, seller);
  if (lang === "en") {
    return {
      privacy: {
        title: "Privacy policy",
        sections: [
          {
            heading: "Who holds the data",
            paragraphs: [
              identity,
              "The seller is the controller of the personal data collected in this shop. Helios is only the panel that runs the shop. Questions about your data go to the seller's email above.",
            ],
          },
          {
            heading: "What is collected",
            paragraphs: [
              "To place an order the shop stores your game nick, email, the product, the price in PLN, the time, the payment operator you chose, the operator's payment reference, and the fact that you asked for immediate delivery of the digital reward. SteamID and a FiveM license are stored only if you type them.",
              "The card number, BLIK code and bank login are entered only on the page of Stripe, PayPal or Przelewy24. This shop does not store them.",
            ],
          },
          {
            heading: "Why, and for how long",
            paragraphs: [
              "The data is used to take the payment, send the reward on the game server, and answer a complaint or a withdrawal. That is necessary to perform the contract (Article 6(1)(b) of the GDPR).",
              "Invoices and payment records are kept for the time required by tax and accounting rules, usually five years from the end of the year of the payment (Article 6(1)(c)).",
              "The same records can be kept to establish or defend a claim (Article 6(1)(f)). The shop does not use this data for advertising.",
            ],
          },
          {
            heading: "Who else receives it",
            paragraphs: [
              "The payment operator you choose receives the data needed to charge you. Stripe and PayPal may process data outside the European Economic Area under their own safeguards, including standard contractual clauses. Przelewy24 processes payments in Poland.",
              "The company that hosts this server can see the database as part of hosting. The game server receives the nick, and SteamID or FiveM license if you gave them, because the reward is a command or a plugin action for that player.",
            ],
          },
          {
            heading: "Your rights",
            paragraphs: [
              "You can ask the seller for access, a copy, correction, deletion, restriction, or to object to processing based on a legitimate interest. You can also lodge a complaint with the President of the Personal Data Protection Office, ul. Stawki 2, 00-193 Warsaw, uodo.gov.pl.",
              "Nick and email are required to buy. Without them the shop cannot deliver the reward or send a refund.",
            ],
          },
        ],
      },
      payment: {
        title: "Payments",
        sections: [
          {
            heading: "Seller and price",
            paragraphs: [
              identity,
              "The price on the product is the full price in PLN. The shop does not add a fee after you press the payment button. The contract is made when the payment operator confirms that the payment succeeded.",
            ],
          },
          {
            heading: "How you pay",
            paragraphs: [
              "The buttons on the shop are the only payment methods. That can be Stripe, PayPal, or Przelewy24 with BLIK, depending on what the seller turned on. You pay that operator. The shop does not ask you to transfer money to a private account from this form.",
              "You need a nick that is yours on the chosen server. The reward is a digital command or plugin action: a rank, an item, money, an unban, or another command described on the product. It is not a physical parcel.",
            ],
          },
          {
            heading: "When the reward arrives",
            paragraphs: [
              "If the product waits for the player, the reward is sent when that nick is online. If the server is off, the order waits and is sent after the server is back. A product that does not wait is sent as soon as the payment is confirmed.",
              "If the payment is confirmed and the reward still is not sent because of the shop or the server, write to the seller. You can ask for the reward or for the price back.",
            ],
          },
        ],
      },
      refund: {
        title: "Refunds and withdrawal",
        sections: [
          {
            heading: "Before the reward is sent",
            paragraphs: [
              identity,
              "The product is digital content, not recorded on a physical medium. Until the reward is sent, you can withdraw from the contract without giving a reason. You have 14 days from the payment confirmation. Send an email to the seller with your nick, the email used at checkout, and a statement that you withdraw.",
              "The seller returns the price by the same payment method within 14 days of receiving that email. An order that is only waiting for you to join the server has not been delivered yet, so you can still withdraw.",
            ],
          },
          {
            heading: "After delivery starts",
            paragraphs: [
              "At checkout you can ask for the reward before those 14 days end. Delivery starts when the command is sent to the server or the plugin confirms the reward. From that moment the right to withdraw is lost, because you agreed to immediate performance and were told about that loss. This is the exception in Article 38(13) of the Polish Consumer Rights Act.",
              "If the command went to the nick you typed, the contract was performed even if that nick was not the one you meant.",
            ],
          },
          {
            heading: "When the reward is wrong or missing",
            paragraphs: [
              "If the reward was not sent, or it is not what the product described, email the seller and say what you bought and what went wrong. The seller either delivers the reward as described or returns the full price by the same payment method.",
              "These rules do not take away any right the statute gives you and do not let the seller waive a right that cannot be waived.",
            ],
          },
        ],
      },
    };
  }

  return {
    privacy: {
      title: "Polityka prywatności",
      sections: [
        {
          heading: "Kto ma dane",
          paragraphs: [
            identity,
            "Sprzedawca jest administratorem danych zebranych w tym sklepie. Helios to tylko panel, na którym sklep działa. Pytania o dane wysyłasz na e-mail sprzedawcy podany wyżej.",
          ],
        },
        {
          heading: "Jakie dane są zbierane",
          paragraphs: [
            "Przy zamówieniu sklep zapisuje nick, e-mail, produkt, cenę w złotych, czas, wybranego operatora płatności, numer płatności u operatora oraz to, że poprosiłeś o natychmiastową dostawę nagrody. SteamID i licencję FiveM sklep zapisuje tylko wtedy, gdy je wpiszesz.",
            "Numer karty, kod BLIK i login do banku wpisujesz wyłącznie na stronie Stripe, PayPal albo Przelewy24. Ten sklep ich nie zapisuje.",
          ],
        },
        {
          heading: "Po co i jak długo",
          paragraphs: [
            "Dane służą do przyjęcia płatności, wysłania nagrody na serwer i do odpowiedzi na reklamację albo odstąpienie. To jest potrzebne do wykonania umowy (art. 6 ust. 1 lit. b RODO).",
            "Zapisy o płatności są trzymane przez czas wymagany przepisami podatkowymi i o rachunkowości, zwykle 5 lat od końca roku, w którym zapłacono (art. 6 ust. 1 lit. c RODO).",
            "Te same zapisy mogą zostać, żeby ustalić albo obronić roszczenie (art. 6 ust. 1 lit. f RODO). Sklep nie używa tych danych do reklamy.",
          ],
        },
        {
          heading: "Komu jeszcze trafiają",
          paragraphs: [
            "Operator, którego wybierzesz, dostaje dane potrzebne do pobrania płatności. Stripe i PayPal mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym na podstawie własnych zabezpieczeń, w tym standardowych klauzul umownych. Przelewy24 obsługuje płatności w Polsce.",
            "Firma, która trzyma ten serwer, może widzieć bazę w ramach hostingu. Serwer gry dostaje nick oraz SteamID albo licencję FiveM, jeśli je podałeś, bo nagroda to komenda albo akcja wtyczki dla tego gracza.",
          ],
        },
        {
          heading: "Twoje prawa",
          paragraphs: [
            "Możesz żądać od sprzedawcy dostępu, kopii, poprawienia, usunięcia, ograniczenia albo sprzeciwić się przetwarzaniu opartemu na prawnie uzasadnionym interesie. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl.",
            "Nick i e-mail są potrzebne, żeby kupić. Bez nich sklep nie wyśle nagrody ani zwrotu.",
          ],
        },
      ],
    },
    payment: {
      title: "Płatności",
      sections: [
        {
          heading: "Sprzedawca i cena",
          paragraphs: [
            identity,
            "Cena przy produkcie jest ceną pełną, w złotych. Sklep nie dolicza opłaty po naciśnięciu płatności. Umowa dochodzi do skutku, gdy operator płatności potwierdzi, że płatność się udała.",
          ],
        },
        {
          heading: "Jak płacisz",
          paragraphs: [
            "Przyciski w sklepie to jedyne sposoby płatności. Może to być Stripe, PayPal albo Przelewy24 z BLIK-iem, zależnie od tego, co sprzedawca włączył. Płacisz temu operatorowi. Sklep nie prosi o przelew na prywatne konto z tego formularza.",
            "Nick musi być twój na wybranym serwerze. Nagroda jest cyfrowa: ranga, przedmiot, pieniądze, odbanowanie albo inna komenda opisana przy produkcie. To nie jest paczka.",
          ],
        },
        {
          heading: "Kiedy przychodzi nagroda",
          paragraphs: [
            "Jeśli produkt czeka na gracza, nagroda idzie, gdy ten nick jest na serwerze. Gdy serwer jest wyłączony, zamówienie czeka i wychodzi po włączeniu serwera. Produkt, który nie czeka, idzie od razu po potwierdzeniu płatności.",
            "Gdy płatność jest potwierdzona, a nagroda dalej nie wyszła z winy sklepu albo serwera, napisz do sprzedawcy. Możesz żądać nagrody albo zwrotu ceny.",
          ],
        },
      ],
    },
    refund: {
      title: "Zwroty i odstąpienie",
      sections: [
        {
          heading: "Zanim nagroda wyjdzie",
          paragraphs: [
            identity,
            "Produkt jest treścią cyfrową, niezapisaną na nośniku. Dopóki nagroda nie została wysłana, możesz odstąpić od umowy bez podawania powodu. Masz na to 14 dni od potwierdzenia płatności. Wyślij e-mail do sprzedawcy: nick, e-mail z zamówienia i zdanie, że odstępujesz.",
            "Sprzedawca oddaje cenę tą samą metodą płatności w ciągu 14 dni od tego e-maila. Zamówienie, które tylko czeka, aż wejdziesz na serwer, nie jest jeszcze dostarczone, więc odstąpienie nadal jest możliwe.",
          ],
        },
        {
          heading: "Gdy dostawa się zacznie",
          paragraphs: [
            "Przy płatności możesz poprosić o nagrodę, zanim te 14 dni minie. Dostawa zaczyna się, gdy komenda trafi na serwer albo wtyczka potwierdzi nagrodę. Od tej chwili prawo odstąpienia przepada, bo zgodziłeś się na natychmiastowe wykonanie i zostałeś o tej utracie poinformowany. To wyjątek z art. 38 pkt 13 ustawy o prawach konsumenta.",
            "Jeśli komenda poszła na nick, który wpisałeś, umowa została wykonana, nawet gdy nick był inny, niż chciałeś.",
          ],
        },
        {
          heading: "Gdy nagrody nie ma albo jest zła",
          paragraphs: [
            "Gdy nagroda nie wyszła albo nie jest taka, jak opis produktu, napisz do sprzedawcy, co kupiłeś i co poszło nie tak. Sprzedawca albo dostarcza nagrodę zgodnie z opisem, albo oddaje pełną cenę tą samą metodą płatności.",
            "Te zasady nie odbierają prawa, które daje ustawa, i nie pozwalają sprzedawcy zrzec się prawa, którego zrzec się nie można.",
          ],
        },
      ],
    },
  };
}
