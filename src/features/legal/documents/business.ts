import type { LegalDocument } from "../types";

export const businessDocument: LegalDocument = {
  kind: "business",
  title: "Contrato do Estabelecimento",
  version: "2026-11-26",
  sections: [
    {
      id: "objeto",
      title: "1. Objeto",
      paragraphs: [
        "A Zenc fornece ao estabelecimento que aceita este Contrato (\"Estabelecimento\") a plataforma de agendamento Zenc: página própria do estabelecimento, agenda, cadastro de profissionais e serviços, lembretes e relatórios.",
      ],
    },
    {
      id: "preco",
      title: "2. Preço e período gratuito",
      paragraphs: [
        "O primeiro mês de uso é gratuito. Depois, o preço é o definido conforme proposta comercial acordada com a Zenc.",
      ],
    },
    {
      id: "obrigacoes-estabelecimento",
      title: "3. Obrigações do Estabelecimento",
      paragraphs: [
        "Manter dados, horários, serviços e preços corretos; honrar os agendamentos confirmados; usar a plataforma de forma lícita; manter a confidencialidade das contas de sua equipe.",
        "O Estabelecimento deve fornecer aos seus clientes o seu próprio aviso de privacidade sobre os registros de atendimento que controla, e responde pelas observações que seus profissionais registram sobre clientes.",
      ],
    },
    {
      id: "papeis-dados",
      title: "4. Papéis no tratamento de dados pessoais",
      paragraphs: [
        "Quanto aos registros de atendimento dos clientes do Estabelecimento (agendamentos, observações, histórico), o Estabelecimento é CONTROLADOR e a Zenc é OPERADORA (art. 39 da LGPD). Quanto à conta Zenc dos clientes, aos registros de acesso e aos dados de erro, a Zenc é controladora, nos termos da Política de Privacidade.",
      ],
    },
    {
      id: "instrucoes-confidencialidade",
      title: "5. Instruções e confidencialidade",
      paragraphs: [
        "A Zenc trata os dados do Estabelecimento somente conforme as instruções dele, que são este Contrato e o uso normal da plataforma. A Zenc mantém confidencialidade sobre esses dados e exige o mesmo de seus colaboradores e suboperadores.",
      ],
    },
    {
      id: "suboperadores",
      title: "6. Suboperadores",
      paragraphs: [
        "O Estabelecimento autoriza o uso dos suboperadores: Supabase (banco de dados e autenticação), Cloudflare (hospedagem e rede), Resend (e-mails), Sentry (monitoramento de erros) e serviços de notificação push da Expo, do Google, da Apple e da Mozilla. A Zenc informará mudanças nessa lista na Política de Privacidade.",
        "Alguns suboperadores processam dados fora do Brasil, com as salvaguardas previstas no art. 33 da LGPD.",
      ],
    },
    {
      id: "seguranca-incidentes",
      title: "7. Segurança e incidentes",
      paragraphs: [
        "A Zenc adota medidas técnicas e administrativas adequadas (arts. 46 e 47 da LGPD).",
        "Em caso de incidente de segurança que afete dados do Estabelecimento, a Zenc o comunicará em até 48 (quarenta e oito) horas após confirmar o incidente, com as informações disponíveis, para que o Estabelecimento possa cumprir o prazo de 3 (três) dias úteis da Resolução CD/ANPD nº 15/2024 para comunicar a ANPD e os titulares, quando exigido.",
      ],
    },
    {
      id: "direitos-titulares",
      title: "8. Direitos dos titulares",
      paragraphs: [
        "A Zenc auxiliará o Estabelecimento a atender pedidos dos titulares (arts. 18 e 19 da LGPD), encaminhando os pedidos que receber e fornecendo, pela plataforma, ferramentas de exportação, correção e exclusão.",
      ],
    },
    {
      id: "devolucao-eliminacao",
      title: "9. Devolução e eliminação ao término",
      paragraphs: [
        "Ao término do Contrato, a Zenc permitirá que o Estabelecimento exporte seus dados e, depois disso, os eliminará ou anonimizará, salvo se a lei exigir a guarda.",
      ],
    },
    {
      id: "responsabilidade",
      title: "10. Responsabilidade",
      paragraphs: [
        "A Zenc responde pelos danos que causar ao descumprir este Contrato, limitados ao que a lei permitir. Nenhuma das partes responde por lucros cessantes, indisponibilidades causadas por terceiros ou força maior.",
      ],
    },
    {
      id: "vigencia-rescisao",
      title: "11. Vigência e rescisão",
      paragraphs: [
        "O Contrato vigora por prazo indeterminado. Qualquer das partes pode encerrá-lo a qualquer momento, com aviso por escrito. A Zenc pode suspender o acesso em caso de descumprimento grave ou de uso ilícito.",
      ],
    },
    {
      id: "lei-foro",
      title: "12. Lei aplicável e foro",
      paragraphs: ["Este Contrato segue a lei brasileira. Fica eleito o foro do domicílio do Estabelecimento."],
    },
  ],
};
