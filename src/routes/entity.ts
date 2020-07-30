import router from './router'

import { Entity, Property, QueryInclude, Logger } from '../models'
import { isLoggedIn } from './base'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import RepositoryService from '../service/repository'
import Tree from './utils/tree'
import * as Consts from './utils/const'

router.get('/entity/count', async (ctx) => {
    ctx.body = {
        data: await Entity.count(),
    }
})

// 展示
router.get('/entity/list', async (ctx) => {
    let where: any = {}
    let { repositoryId } = ctx.query
    if (repositoryId) where.repositoryId = repositoryId
    ctx.body = {
        data: await Entity.findAll({ where }),
    }
})

// 查询模型
router.get('/entity/get', async (ctx) => {
    let { id } = ctx.query

    if (id === undefined || id === '') {
        ctx.body = {
            isOk: false,
            errMsg: '请输入参数id'
        }
        return
    }

    let ent = await Entity.findByPk(id, {
        attributes: { exclude: [] },
    })

    if (!ent) {
        ctx.body = {
            isOk: false,
            errMsg: `没有找到 id 为 ${id} 的实体`
        }
        return
    }

    if (
        !(await AccessUtils.canUserAccess(
            ACCESS_TYPE.REPOSITORY_GET,
            ctx.session.id,
            ent.repositoryId
        ))
    ) {
        ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
        return
    }

    const entJSON: { [k: string]: any } = ent.toJSON()

    let properties: any[] = await Property.findAll({
        attributes: { exclude: [] },
        where: { entityId: ent.id },
    })

    properties = properties.map((item: any) => item.toJSON())
    entJSON['properties'] = properties

    let scopes = ['request', 'response']
    for (let i = 0; i < scopes.length; i++) {
        let scopeProperties = properties
            .filter(p => p.scope === scopes[i])
            .map((item: any) => ({ ...item }))
        entJSON[scopes[i] + 'Properties'] = Tree.ArrayToTree(scopeProperties).children
    }

    ctx.type = 'json'
    ctx.body = Tree.stringifyWithFunctonAndRegExp({ data: entJSON })
})

// 新增模型
router.post('/entity/create', isLoggedIn, async (ctx, next) => {
    let creatorId = ctx.session.id
    let body = Object.assign(ctx.request.body, { creatorId })
    body.priority = Date.now()
    let created = await Entity.create(body)
    // await initInterface(created)
    ctx.body = {
      data: {
        ent: await Entity.findByPk(created.id),
      }
    }
    return next()
  }, async (ctx) => {
    let ent = ctx.body.data
    await Logger.create({
      userId: ctx.session.id,
      type: 'create',
      repositoryId: ent.repositoryId,
      moduleId: ent.moduleId,
      entityId: ent.id,
    })
  })

  // 修改模型
  router.post('/entity/update', isLoggedIn, async (ctx, next) => {
    let body = ctx.request.body
    if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ENTITY_SET, ctx.session.id, +body.id)) {
      ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
      return
    }
    await Entity.update(body, {
      where: { id: body.id }
    })
    ctx.body = {
      data: {
        ent: await Entity.findByPk(body.id),
      }
    }
    return next()
  }, async (ctx) => {
    if (ctx.body.data === 0) return
    let ent = ctx.request.body
    await Logger.create({
      userId: ctx.session.id,
      type: 'update',
      repositoryId: ent.repositoryId,
      moduleId: ent.moduleId,
      entityId: ent.id,
    })
  })
  
  router.post('/entity/move', isLoggedIn, async ctx => {
    const { modId, entId, op } = ctx.request.body
    const ent = await Entity.findByPk(entId)
    const repositoryId = ctx.request.body.repositoryId || ent.repositoryId
    if (!(await RepositoryService.canUserMoveInterface(ctx.session.id, entId, repositoryId, modId))) {
      ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
      return
    }
  
    await RepositoryService.moveEntity(op, entId, repositoryId, modId)
  
    ctx.body = {
      data: {
        isOk: true,
      },
    }
  })
  
  router.get('/entity/remove', async (ctx, next) => {
    let { id } = ctx.query
    if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ENTITY_SET, ctx.session.id, +id)) {
      ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
      return
    }
    let result = await Entity.destroy({ where: { id } })
    await Property.destroy({ where: { entityId: id } })
    ctx.body = {
      data: result,
    }
    return next()
  }, async (ctx) => {
    if (ctx.body.data === 0) return
    let { id } = ctx.query
    let ent = await Entity.findByPk(id, { paranoid: false })
    await Logger.create({
      userId: ctx.session.id,
      type: 'delete',
      repositoryId: ent.repositoryId,
      moduleId: ent.moduleId,
      entityId: ent.id,
    })
  })

router.post('/entity/lock', async (ctx, next) => {
    if (!ctx.session.id) {
        ctx.body = Consts.COMMON_ERROR_RES.NOT_LOGIN
        return
    }

    let { id } = ctx.request.body
    if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ENTITY_SET, ctx.session.id, +id)) {
        ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
        return
    }
    let ent = await Entity.findByPk(id, {
        attributes: ['lockerId'],
        include: [
            QueryInclude.Locker,
        ]
    })
    if (ent.lockerId) { // DONE 2.3 BUG 接口可能被不同的人重复锁定。如果已经被锁定，则忽略。
        ctx.body = {
            data: ent.locker,
        }
        return
    }

    await Entity.update({ lockerId: ctx.session.id }, { where: { id } })
    ent = await Entity.findByPk(id, {
        attributes: ['lockerId'],
        include: [
            QueryInclude.Locker,
        ]
    })
    ctx.body = {
        data: ent.locker,
    }
    return next()
})

router.post('/entity/unlock', async (ctx) => {
    if (!ctx.session.id) {
        ctx.body = Consts.COMMON_ERROR_RES.NOT_LOGIN
        return
    }

    let { id } = ctx.request.body
    if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ENTITY_SET, ctx.session.id, +id)) {
        ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
        return
    }
    let ent = await Entity.findByPk(id, { attributes: ['lockerId'] })
    if (ent.lockerId !== ctx.session.id) { // DONE 2.3 BUG 接口可能被其他人解锁。如果不是同一个用户，则忽略。
        ctx.body = {
            isOk: false,
            errMsg: '您不是锁定该接口的用户，无法对其解除锁定状态。请刷新页面。',
        }
        return
    }
    await Entity.update({
        // tslint:disable-next-line:no-null-keyword
        lockerId: null,
    }, {
        where: { id }
    })

    ctx.body = {
        data: {
            isOk: true,
        }
    }
})
