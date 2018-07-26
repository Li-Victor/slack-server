import formatErrors from '../formatErrors';
import requiresAuth from '../permissions';

export default {
  Query: {
    getTeamMembers: requiresAuth.createResolver(async (parent, { teamId }, { models }) => models.sequelize.query(
      'SELECT * FROM users JOIN members ON members.user_id = users.id WHERE members.team_id = ?',
      {
        replacements: [teamId],
        model: models.User,
        raw: true
      }
    ))
  },
  Mutation: {
    addTeamMember: requiresAuth.createResolver(
      async (parent, { email, teamId }, { models, user }) => {
        try {
          const memberPromise = models.Member.findOne(
            { where: { teamId, userId: user.id } },
            { raw: true }
          );
          const userToAddPromise = await models.User.findOne({ where: { email } }, { raw: true });
          const [member, userToAdd] = await Promise.all([memberPromise, userToAddPromise]);
          if (!member.admin) {
            return {
              ok: false,
              errors: [{ path: 'email', message: 'You cannot add members to the team' }]
            };
          }

          if (!userToAdd) {
            return {
              ok: false,
              errors: [{ path: 'email', message: 'Could not find user with this email' }]
            };
          }

          await models.Member.create({ userId: userToAdd.id, teamId });
          return {
            ok: true
          };
        } catch (err) {
          console.log(err);
          return {
            ok: false,
            errors: formatErrors(err, models)
          };
        }
      }
    ),
    createTeam: requiresAuth.createResolver(async (parent, args, { models, user }) => {
      try {
        const response = await models.sequelize.transaction(async transaction => {
          const team = await models.Team.create({ ...args, owner: user.id }, { transaction });
          await models.Channel.create(
            { name: 'general', public: true, teamId: team.id },
            { transaction }
          );
          await models.Member.create(
            { teamId: team.id, userId: user.id, admin: true },
            { transaction }
          );
          return team;
        });
        return {
          ok: true,
          team: response
        };
      } catch (err) {
        console.log(err);
        return {
          ok: false,
          errors: formatErrors(err, models)
        };
      }
    })
  },
  Team: {
    channels: ({ id }, args, { models }) => models.Channel.findAll({ where: { teamId: id } }),
    directMessageMembers: ({ id }, args, { models, user }) => models.sequelize.query(
      'SELECT DISTINCT on (u.id) u.id, u.username FROM users AS u JOIN direct_messages AS dm ON (u.id = dm.sender_id) OR (u.id = dm.receiver_id) WHERE (:currentUserId = dm.sender_id OR :currentUserId = dm.receiver_id) AND dm.team_id = :teamId',
      {
        replacements: { currentUserId: user.id, teamId: id },
        model: models.User,
        raw: true
      }
    )
  }
};
