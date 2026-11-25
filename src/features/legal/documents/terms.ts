import type { LegalDocument } from "../types";

export const termsDocument: LegalDocument = {
  kind: "terms",
  title: "Termos de Uso",
  version: "2026-11-26",
  sections: [
    {
      id: "definicoes",
      title: "1. Definições",
      paragraphs: [
        "Zenc: a plataforma de agendamento operada por {{razaoSocial}}, CNPJ {{cnpj}}. Estabelecimento: o negócio de beleza que usa a Zenc para receber agendamentos. Profissional: quem atende em um estabelecimento. Cliente: quem agenda um serviço. Conta: o seu cadastro único na Zenc.",
      ],
    },
    {
      id: "conta",
      title: "2. Conta e elegibilidade",
      paragraphs: [
        "Para criar uma conta você precisa ter 18 anos ou mais e informar dados verdadeiros. Você é responsável pela guarda da sua senha e por tudo o que acontece na sua conta.",
        "A conta de cliente é única para todos os estabelecimentos. Contas de profissional e de dono ficam ligadas a um único estabelecimento.",
      ],
    },
    {
      id: "uso",
      title: "3. Uso permitido e proibido",
      paragraphs: [
        "Você pode usar a Zenc para consultar horários, agendar, remarcar e cancelar atendimentos e, se for profissional ou dono, gerir a agenda do estabelecimento.",
        "É proibido: usar a Zenc para fins ilegais, tentar acessar dados de outras pessoas ou de outros estabelecimentos, enviar conteúdo ofensivo, criar agendamentos falsos, usar robôs ou automações que sobrecarreguem o serviço e tentar contornar medidas de segurança.",
      ],
    },
    {
      id: "servico-prestado",
      title: "4. A Zenc não é parte do serviço prestado",
      paragraphs: [
        "A Zenc fornece a ferramenta de agendamento. O serviço de beleza é prestado pelo estabelecimento, e a Zenc não é parte dessa relação. Regras de cancelamento, falta, atraso, preço, forma de pagamento e qualidade do atendimento são definidas e cumpridas pelo estabelecimento.",
        "Quando você agenda, aceita as regras daquele estabelecimento. Dúvidas ou reclamações sobre o atendimento devem ser feitas diretamente a ele.",
      ],
    },
    {
      id: "obrigacoes-estabelecimento",
      title: "5. Obrigações do estabelecimento",
      paragraphs: [
        "O estabelecimento deve manter horários, serviços e preços corretos, honrar os agendamentos confirmados, avisar os clientes sobre mudanças e tratar os dados dos clientes conforme a lei e o Contrato do Estabelecimento.",
      ],
    },
    {
      id: "responsabilidade",
      title: "6. Responsabilidade",
      paragraphs: [
        "A Zenc responde pelos serviços que presta nos termos do Código de Defesa do Consumidor, quando aplicável. A Zenc não responde por atos ou omissões dos estabelecimentos e profissionais, nem por indisponibilidades causadas por terceiros, falhas de internet ou casos de força maior.",
      ],
    },
    {
      id: "suspensao-encerramento",
      title: "7. Suspensão e encerramento",
      paragraphs: [
        "Podemos suspender ou encerrar uma conta que viole estes Termos, mediante aviso quando possível. Você pode encerrar a sua conta a qualquer momento e baixar uma cópia dos seus dados antes disso, em Privacidade.",
      ],
    },
    {
      id: "privacidade",
      title: "8. Privacidade",
      paragraphs: ["O tratamento de dados pessoais segue a Política de Privacidade, que faz parte destes Termos."],
    },
    {
      id: "alteracoes",
      title: "9. Alterações",
      paragraphs: [
        "Podemos atualizar estes Termos. Cada versão tem uma data e, em mudanças relevantes, pediremos que você aceite a nova versão para continuar usando o aplicativo.",
      ],
    },
    {
      id: "lei-foro",
      title: "10. Lei aplicável e foro",
      paragraphs: [
        "Estes Termos seguem a lei brasileira. Fica eleito o foro de {{foro}} para resolver conflitos, ressalvado o direito do consumidor de ajuizar ação no foro do seu domicílio.",
      ],
    },
  ],
};
