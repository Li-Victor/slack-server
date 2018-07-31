import formatErrors from '../formatErrors';
import { requiresAuth } from '../permissions';

export default {
  Mutation: {
    getOrCreateChannel: requiresAuth.createResolver(
      async (parent, { teamId, members }, { models, user }) => {
        members.push(user.id);
        // check if dm channel already exists with these members
        const [data, result] = await models.sequelize.query(
          `
            SELECT c.id
            FROM channels c, pcmembers pc
            WHERE pc.channel_id = c.id AND c.dm = true AND c.public = false AND c.team_id = ${teamId}
            group by c.id
            HAVING array_agg(pc.user_id) @> Array[${members.join(',')}] AND COUNT(pc.user_id) = ${
  members.length
};
      `,
          { raw: true }
        );

        console.log(data, result);

        if (data.length) {
          return data[0].id;
        }

        const channelId = await models.sequelize.transaction(async transaction => {
          const channel = await models.Channel.create(
            {
              name: 'hello',
              public: false,
              dm: true,
              teamId
            },
            { transaction }
          );

          const cId = channel.dataValues.id;
          const pcmembers = members.map(m => ({ userId: m, channelId: cId }));
          await models.PCMember.bulkCreate(pcmembers, { transaction });
          return cId;
        });

        return channelId;
      }
    ),
    createChannel: requiresAuth.createResolver(async (parent, args, { models, user }) => {
      try {
        const member = await models.Member.findOne(
          { where: { teamId: args.teamId, userId: user.id } },
          { raw: true }
        );

        if (!member.admin) {
          return {
            ok: false,
            errors: [
              {
                path: 'name',
                message: 'You have to be the owner of the team to create channels'
              }
            ]
          };
        }

        const response = await models.sequelize.transaction(async transaction => {
          const channel = await models.Channel.create(args, { transaction });
          if (!args.public) {
            const members = args.members.filter(m => m !== user.id);
            members.push(user.id);
            const pcmembers = members.map(m => ({ userId: m, channelId: channel.dataValues.id }));
            await models.PCMember.bulkCreate(pcmembers, { transaction });
          }
          return channel;
        });
        return {
          ok: true,
          channel: response
        };
      } catch (err) {
        console.log(err);
        return { ok: false, errors: formatErrors(err, models) };
      }
    })
  }
};
