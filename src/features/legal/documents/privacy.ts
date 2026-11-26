import { DPO_EMAIL } from "../company";
import type { LegalDocument } from "../types";

export const privacyDocument: LegalDocument = {
  kind: "privacy",
  title: "Política de Privacidade",
  version: "2026-11-26",
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem somos",
      paragraphs: [
        "A Zenc é uma plataforma de agendamento para estabelecimentos do setor de beleza.",
        "Esta Política explica como tratamos dados pessoais de clientes, profissionais e donos de estabelecimentos, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018, \"LGPD\").",
      ],
    },
    {
      id: "papeis",
      title: "2. Quem decide sobre os seus dados (controlador e operador)",
      paragraphs: [
        "A Zenc é CONTROLADORA dos dados da sua conta e do seu perfil (nome, e-mail, telefone, apelido, foto e aceites de documentos), dos registros de acesso e segurança e dos dados de erros do aplicativo.",
        "Quando você agenda um serviço, seu nome, telefone e e-mail são compartilhados com o estabelecimento escolhido. Esse estabelecimento passa a ser CONTROLADOR dos seus registros de atendimento (agendamentos, observações, histórico). Nesse caso a Zenc atua como OPERADORA, tratando os dados somente conforme as instruções do estabelecimento (art. 39 da LGPD).",
        "Sua conta é uma conta Zenc, única para todos os estabelecimentos. Somente donos e profissionais ficam ligados a um único estabelecimento.",
      ],
    },
    {
      id: "dados",
      title: "3. Quais dados tratamos",
      paragraphs: [
        "Conta e perfil: nome, apelido, e-mail, telefone, foto, idioma e preferências de notificação.",
        "Agendamentos: serviço, profissional, data e horário, status, observações registradas pelo estabelecimento e histórico de recorrências.",
        "Notificações: tokens de notificação do seu aparelho ou navegador, necessários para enviar lembretes e avisos.",
        "Dados técnicos: endereço IP, data e hora de acesso, tipo de aparelho e navegador, e relatórios de erro.",
        "Não pedimos dados de saúde. Caso você ou o estabelecimento escrevam informações desse tipo nas observações de um atendimento, o estabelecimento é o responsável por esse registro (art. 11 da LGPD).",
      ],
    },
    {
      id: "finalidades-bases",
      title: "4. Para que usamos os dados e em qual base legal",
      paragraphs: [
        "Executar o contrato (art. 7º, V): criar e manter a conta, permitir agendar, remarcar e cancelar, enviar lembretes e avisos do serviço. É a base principal.",
        "Cumprir obrigação legal (art. 7º, II): guardar registros de acesso pelo prazo exigido pelo Marco Civil da Internet e atender ordens de autoridades.",
        "Legítimo interesse (art. 7º, IX): segurança, prevenção a fraudes e abusos, e medição de erros para corrigir falhas, sempre respeitando seus direitos.",
        "Não vendemos seus dados e não os usamos para publicidade de terceiros.",
      ],
    },
    {
      id: "compartilhamento",
      title: "5. Com quem compartilhamos",
      paragraphs: [
        "Com o estabelecimento em que você agenda: nome, telefone, e-mail e dados do agendamento.",
        "Com operadores que prestam serviços à Zenc, listados na seção 6, sob contrato e apenas para os fins descritos aqui.",
        "Com autoridades, quando houver obrigação legal ou ordem judicial.",
      ],
    },
    {
      id: "operadores-transferencia",
      title: "6. Operadores e transferência internacional",
      paragraphs: [
        "Usamos: Supabase (banco de dados e autenticação), Cloudflare (hospedagem e rede), Resend (envio de e-mails), Sentry (monitoramento de erros) e os serviços de notificação push da Expo, do Google, da Apple e da Mozilla.",
        "Alguns desses operadores armazenam ou processam dados fora do Brasil. Essa transferência internacional (art. 33 da LGPD) é feita com salvaguardas contratuais e apenas para as finalidades desta Política.",
      ],
    },
    {
      id: "retencao",
      title: "7. Por quanto tempo guardamos",
      paragraphs: [
        "Conta e perfil: até você excluir a conta. Ao excluir, seus dados pessoais são removidos e o histórico de atendimentos é anonimizado, para que o estabelecimento preserve seus registros financeiros sem identificar você.",
        "Registros de acesso: 6 (seis) meses, conforme o art. 15 do Marco Civil da Internet (Lei 12.965/2014).",
        "Dados de erros: o mínimo necessário para corrigir a falha, em geral até 90 dias.",
        "Registros de atendimento: pelo prazo definido pelo estabelecimento controlador.",
      ],
    },
    {
      id: "seguranca",
      title: "8. Segurança",
      paragraphs: [
        "Adotamos medidas técnicas e administrativas para proteger os dados (arts. 46 e 47 da LGPD): conexão criptografada, controle de acesso por papel, isolamento entre estabelecimentos e cópias de segurança.",
        "Nenhum sistema é totalmente imune a falhas. Se algo acontecer, seguimos a seção 13.",
      ],
    },
    {
      id: "cookies",
      title: "9. Cookies",
      paragraphs: [
        "Usamos apenas o cookie de sessão, em .zencpro.app, necessário para manter você conectado. Não usamos cookies de análise nem de publicidade, por isso não exibimos aviso de cookies.",
      ],
    },
    {
      id: "direitos",
      title: "10. Seus direitos",
      paragraphs: [
        "Você pode, a qualquer momento (arts. 18 e 19 da LGPD): confirmar que tratamos seus dados, acessá-los, corrigi-los, pedir anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogar consentimentos.",
        "No aplicativo: edite seus dados em Conta, baixe uma cópia em Privacidade > Baixar meus dados e exclua a conta em Privacidade > Excluir minha conta. Donos de estabelecimento pedem o encerramento pelo e-mail da seção 12.",
        "Para dados de atendimento mantidos por um estabelecimento, o pedido também pode ser feito a ele.",
      ],
    },
    {
      id: "menores",
      title: "11. Crianças e adolescentes",
      paragraphs: [
        "Contas Zenc são para maiores de 18 anos. Menores de idade podem ser agendados por um responsável legal, que cria a própria conta e responde pelo agendamento (art. 14 da LGPD).",
      ],
    },
    {
      id: "encarregado",
      title: "12. Encarregado (DPO)",
      paragraphs: [
        `Para exercer direitos ou tirar dúvidas, escreva ao encarregado pela proteção de dados: ${DPO_EMAIL} (art. 41 da LGPD).`,
      ],
    },
    {
      id: "incidentes",
      title: "13. Incidentes de segurança",
      paragraphs: [
        "Se ocorrer um incidente que possa causar risco ou dano relevante, avisaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados, nos termos do art. 48 da LGPD. Quando a Zenc atuar como operadora, avisaremos também o estabelecimento controlador, conforme o Contrato do Estabelecimento.",
      ],
    },
    {
      id: "alteracoes",
      title: "14. Alterações desta Política",
      paragraphs: [
        "Podemos atualizar esta Política. Cada versão tem uma data. Quando a mudança for relevante, pediremos que você aceite a nova versão antes de continuar usando o aplicativo (art. 8º, § 6º da LGPD).",
      ],
    },
  ],
};
